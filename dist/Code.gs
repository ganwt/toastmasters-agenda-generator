// toastmasters-agenda-generator（https://github.com/ganwt/toastmasters-agenda-generator）
// このファイルは npm run build で src/ から生成したものです。直接編集しないでください。

// ===== dev.js =====
// 開発用の関数（メニューには出さない。Apps Script のエディタから実行する）

// スピーチ 3 本の行挿入の確認用：第 384 回のデータを元に、両セッションともスピーチ 3 本にした人工データで作成する
function testThreeSpeeches() {
  var m = fetchMeeting(257);
  ['ja', 'en'].forEach(function (lang) {
    var base = m.speeches[lang][0];
    [2, 3].forEach(function (slot) {
      var s = JSON.parse(JSON.stringify(base));
      s.slot = slot;
      s.title = '（テスト）' + slot + ' 本目';
      m.speeches[lang].push(s);
    });
  });
  m.speeches.ja[2].time_limit = { min: 4, max: 6 };
  m.number = 999; // ファイル名で本番と区別する
  var r = createProgramFromMeeting(m);
  Logger.log(r.url);
}

// 定期実行の確認用：日付を指定して、定期実行と同じ処理を行う
function testScheduledOnMeetingDay() { runScheduled('2026/11/05'); } // 第 386 回の当日 → 作成（2 回目は「作成済み」）
function testScheduledOnOtherDay() { runScheduled('2026/11/12'); } // 例会の無い木曜 → 何もしない

// ===== fill.js =====
// meeting オブジェクト → テンプレートへの記入内容（セル番地と値の一覧）。
// Apps Script の API は使わない純粋な関数。記入ルールは docs/SPEC.md の 4.1・5 章。

var VENUES = {
  '角筈地域センター': { label: '角筈地域センター7F', url: 'https://tsunohazucc.com/tsunohazu_map.html' },
  '四谷地域センター': { label: '四谷地域センター', url: 'http://ycc.tokyo/about.html' }
};

// ヘルパー役の記入順（J13〜J18）。JE / EJ とも同じ順
var HELPER_ROLES = ['計時係', 'えーとカウンター', '笑いカウンター', '文法係', '集計係', '例会報告係'];

var SESSION_ROLES = {
  ja: { tmoe: '今夜のトーストマスター', ttm: 'テーブルトピックスマスター', ge: '総合論評', evals: ['論評1', '論評2', '論評3'] },
  en: { tmoe: 'Toastmaster of the Evening', ttm: 'Table Topics Master', ge: 'General Evaluation', evals: ['Evaluation1', 'Evaluation2', 'Evaluation3'] }
};

// セッションの位置（前半 / 後半）ごとのセル番地。speech2Rows はスピーチ 2 のブロック（3 本目を挿入するときの複写元）
var SESSION_CELLS = {
  first: {
    speech2Rows: [25, 28],
    speeches: [
      { speaker: 'J21', title: 'F22', project: 'F23', time: 'C22', comment: 'C24' },
      { speaker: 'J25', title: 'F26', project: 'F27', time: 'C26', comment: 'C28' }
    ],
    ttm: 'J31',
    evals: [{ name: 'J36', time: 'C36' }, { name: 'J37', time: 'C37' }],
    ge: 'J38'
  },
  second: {
    speech2Rows: [49, 52],
    speeches: [
      { speaker: 'J45', title: 'F46', project: 'F47', time: 'C45', comment: 'C48' },
      { speaker: 'J49', title: 'F50', project: 'F51', time: 'C49', comment: 'C52' }
    ],
    ttm: 'J54',
    evals: [{ name: 'J60', time: 'C60' }, { name: 'J61', time: 'C61' }],
    ge: 'J62'
  }
};

var GUEST_ROWS = { first: 7, last: 17 };
var MEMBER_ROWS = { first: 19, last: 70 };
var TEMPLATE_CHECKBOX_ROWS = { guests: [7, 12], members: [19, 24] };
var OBJECTIVE_SLOTS = [{ title: 'B3', desc: 'B4' }, { title: 'B5', desc: 'B6' }, { title: 'B7', desc: 'B8' }]; // テンプレートにある枠
var WEEKDAYS_JA = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

var SPEECH_MINUTES_EXTRA = 1; // スピーチ枠 = 時限の上限 + 1 分
var COMMENT_MINUTES = 1;
var EVAL_MINUTES = 5;
var DEFAULT_TIME_LIMIT = { min: 5, max: 7 };

function parseDateParts(date) {
  var m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(date || '');
  if (!m) throw new Error('日付の形式が不正です：' + date);
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function mmdd(date) {
  var p = parseDateParts(date);
  return pad2(p.m) + '/' + pad2(p.d);
}

function weekdayJa(date) {
  var p = parseDateParts(date);
  return WEEKDAYS_JA[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

function formatSpeechTitle(speech, lang) {
  var t = speech.time_limit || DEFAULT_TIME_LIMIT;
  if (lang === 'ja') return '『' + speech.title + '』（' + t.min + '～' + t.max + '分）';
  return '"' + speech.title + '" (' + t.min + '-' + t.max + ' min)';
}

function formatProjectLine(speech, lang) {
  if (!speech.project) return speech.path || '';
  var sep = lang === 'ja' ? '：' : ': ';
  var head = [speech.path, speech.level].filter(function (s) { return s; }).join(' ');
  return head ? head + sep + speech.project : speech.project;
}

function venueLine(meeting, warnings) {
  var v = VENUES[meeting.venue];
  if (!v) {
    warnings.push('会場「' + meeting.venue + '」の地図 URL が未登録です');
    return '会場：' + [meeting.venue, meeting.room].filter(function (s) { return s; }).join(' ');
  }
  return '会場：' + v.label + ' ' + meeting.room + '\n' + v.url;
}

function isAttending(mark) {
  return mark === '○' || mark.indexOf('◎') === 0;
}

// settings: { zoom: 'Zoom の URL・ID・パスコード（複数行）', findProject: function(speech) → {desc_ja, desc_en} | null }
function buildFillPlan(meeting, settings) {
  settings = settings || {};
  var warnings = [];
  var cells = [];
  var role = function (name) { return meeting.roles[name] || ''; };
  var order = meeting.format === 'JE' ? ['ja', 'en'] : ['en', 'ja'];

  // スピーチ 3 本のセッションは行を挿入する。セル番地はテンプレートの行番号で書き、挿入後の番号に直して記録する
  var inserts = planInserts(meeting, order);
  var at = function (cell) {
    var m = /^([A-Z]+)(\d+)$/.exec(cell);
    return m[1] + shiftRow(inserts, parseInt(m[2], 10));
  };
  // offset > 0：挿入した行（複写元の行の n 行下）を指す
  var below = function (cell, offset) {
    var m = /^([A-Z]+)(\d+)$/.exec(cell);
    return m[1] + (shiftRow(inserts, parseInt(m[2], 10)) + offset);
  };
  var setAt = function (cell, value) { cells.push({ cell: cell, value: value }); };
  var minutesAt = function (cell, minutes) { cells.push({ cell: cell, minutes: minutes }); };
  var set = function (cell, value) { setAt(at(cell), value); };
  var setMinutes = function (cell, minutes) { minutesAt(at(cell), minutes); };

  // ヘッダー
  set('G1', '第' + meeting.number + '回');
  set('J2', mmdd(meeting.date) + ' 19:15～21:15');
  var zoom = (settings.zoom || '').replace(/\r\n?/g, '\n').trim();
  if (!zoom) warnings.push('Zoom 情報が設定されていません');
  set('J3', [zoom, venueLine(meeting, warnings)].filter(function (s) { return s; }).join('\n'));

  // 例会全体の役割
  set('J10', role(SESSION_ROLES[order[0]].tmoe));
  set('J11', role('今夜の言葉（日英）'));
  HELPER_ROLES.forEach(function (r, i) { set('J' + (13 + i), role(r)); });
  var secondTmoe = role(SESSION_ROLES[order[1]].tmoe);
  set('J43', secondTmoe ? 'TMOE: ' + secondTmoe : '');

  // セッションごと
  var objectives = [];
  ['first', 'second'].forEach(function (pos, i) {
    var lang = order[i];
    var c = SESSION_CELLS[pos];
    var r = SESSION_ROLES[lang];
    var speeches = meeting.speeches[lang] || [];
    var three = speeches.some(function (s) { return s.slot === 3; });
    speeches.forEach(function (s) {
      if (s.slot > 3) warnings.push((lang === 'ja' ? '準備スピーチ' : 'Prepared Speech') + s.slot + ' は 4 本目以降のため記入していません');
    });
    // 3 本目の枠は 2 本目のブロックの 4 行下、論評 3 は論評 2 の 1 行下（どちらも挿入した行）
    var speechCells = c.speeches.map(function (sc) {
      return { speaker: at(sc.speaker), title: at(sc.title), project: at(sc.project), time: at(sc.time), comment: at(sc.comment) };
    });
    var evalCells = c.evals.map(function (ec) { return { name: at(ec.name), time: at(ec.time) }; });
    if (three) {
      var s2 = c.speeches[1];
      speechCells.push({ speaker: below(s2.speaker, 4), title: below(s2.title, 4), project: below(s2.project, 4), time: below(s2.time, 4), comment: below(s2.comment, 4) });
      evalCells.push({ name: below(c.evals[1].name, 1), time: below(c.evals[1].time, 1) });
    }
    speechCells.forEach(function (sc, k) {
      var s = speeches.filter(function (x) { return x.slot === k + 1; })[0];
      setAt(sc.speaker, s ? s.speaker : '');
      setAt(sc.title, s ? formatSpeechTitle(s, lang) : '');
      setAt(sc.project, s ? formatProjectLine(s, lang) : '');
      minutesAt(sc.time, s ? (s.time_limit || DEFAULT_TIME_LIMIT).max + SPEECH_MINUTES_EXTRA : 0);
      minutesAt(sc.comment, s ? COMMENT_MINUTES : 0);
      if (s) objectives.push({ speech: s, lang: lang });
    });
    set(c.ttm, role(r.ttm));
    evalCells.forEach(function (ec, k) {
      var name = role(r.evals[k]);
      setAt(ec.name, name);
      minutesAt(ec.time, name ? EVAL_MINUTES : 0);
    });
    set(c.ge, role(r.ge));
  });

  // 右側の欄：ゲスト
  var guests = (meeting.guests || []).filter(function (g) { return g.indexOf('キャンセル') === -1; });
  var guestCapacity = GUEST_ROWS.last - GUEST_ROWS.first + 1;
  if (guests.length > guestCapacity) warnings.push('ゲストが ' + guests.length + ' 人で欄（' + guestCapacity + ' 行）に入りきりません');
  // 右側の欄は挿入後のシートで上から詰めるので、行番号は直さない
  fillChecklist(setAt, GUEST_ROWS, TEMPLATE_CHECKBOX_ROWS.guests, guests);

  // 右側の欄：出席予定会員
  var members = (meeting.attendance || []).filter(function (a) { return isAttending(a.mark); }).map(function (a) { return a.name; });
  var memberCapacity = MEMBER_ROWS.last - MEMBER_ROWS.first + 1;
  if (members.length > memberCapacity) warnings.push('出席予定会員が ' + members.length + ' 人で欄に入りきりません');
  fillChecklist(setAt, MEMBER_ROWS, TEMPLATE_CHECKBOX_ROWS.members, members);

  // 今後の予定
  var next = (meeting.upcoming || []).filter(function (u) { return u.number !== meeting.number; }).slice(0, 2);
  ['H73', 'H74'].forEach(function (cell, k) {
    var u = next[k];
    set(cell, u ? mmdd(u.date) + '　' + weekdayJa(u.date) + '　第' + u.number + '回例会' : '');
  });

  var p = parseDateParts(meeting.date);
  return {
    sheet: meeting.format,
    inserts: inserts.map(function (ins) {
      var after = shiftRow(inserts, ins.after);
      return { after: after, count: ins.count, from: shiftRow(inserts, ins.from), label: 'F' + (after + 1) };
    }),
    cells: cells,
    objectives: buildObjectives(objectives, settings, warnings),
    fileName: '新宿BTMC第' + meeting.number + '回例会プログラム' + p.y + pad2(p.m) + pad2(p.d),
    warnings: warnings
  };
}

// 3 本目のスピーチがあるセッションごとに、スピーチ 2 のブロック（4 行）と論評 2 の行（1 行）を複写して挿入する。
// after / from はテンプレートの行番号。上から順に並べる
function planInserts(meeting, order) {
  var inserts = [];
  ['first', 'second'].forEach(function (pos, i) {
    var speeches = meeting.speeches[order[i]] || [];
    if (!speeches.some(function (s) { return s.slot === 3; })) return;
    var c = SESSION_CELLS[pos];
    var evalRow = parseInt(c.evals[1].name.slice(1), 10);
    inserts.push({ after: c.speech2Rows[1], count: 4, from: c.speech2Rows[0] });
    inserts.push({ after: evalRow, count: 1, from: evalRow });
  });
  return inserts.sort(function (a, b) { return a.after - b.after; });
}

// テンプレートの行番号 → 挿入後の行番号
function shiftRow(inserts, row) {
  var r = row;
  inserts.forEach(function (ins) { if (ins.after < row) r += ins.count; });
  return r;
}

// 名前を上から詰めて書き、□ は名前のある行だけに付ける（テンプレートの余分な □ は消す）
function fillChecklist(set, rows, templateBoxRows, names) {
  var last = Math.max(templateBoxRows[1], rows.first + names.length - 1);
  for (var row = rows.first; row <= Math.min(last, rows.last); row++) {
    var name = names[row - rows.first];
    set('N' + row, name ? '□' : '');
    set('O' + row, name || '');
  }
}

// プロジェクト目標シート：同じプロジェクトは 1 回だけ。並びはプログラムに出てくる順
function buildObjectives(items, settings, warnings) {
  var seen = {};
  var result = [];
  items.forEach(function (it) {
    var s = it.speech;
    var key = s.project_row ? 'row:' + s.project_row : 'name:' + s.project;
    if (!s.project || seen[key]) return;
    seen[key] = true;
    var info = settings.findProject ? settings.findProject(s) : null;
    var desc = info ? (it.lang === 'ja' ? info.desc_ja : info.desc_en) || '' : '';
    if (!desc) warnings.push('プロジェクト「' + s.project + '」の説明が見つかりません（見出しのみ記入）');
    result.push({ title: (s.level ? s.level + ': ' : '') + s.project, description: desc });
  });
  return result;
}

// プロジェクト目標シートへの記入。使わない枠の行は隠す（印刷されない）。
// 3 件を超える分（B9 以降）は、シート側で行を追加してから書く
function objectiveLayout(objectives) {
  var cells = [];
  var hideRows = [];
  var n = Math.max(objectives.length, OBJECTIVE_SLOTS.length);
  for (var i = 0; i < n; i++) {
    var o = objectives[i];
    var titleRow = 3 + i * 2;
    if (o) {
      cells.push({ cell: 'B' + titleRow, value: o.title });
      cells.push({ cell: 'B' + (titleRow + 1), value: o.description });
    } else {
      hideRows.push(titleRow, titleRow + 1);
    }
  }
  return { cells: cells, hideRows: hideRows, extraSlots: Math.max(0, objectives.length - OBJECTIVE_SLOTS.length) };
}

// 例会ページのスピーチ → PROJECTS（src/projects.js）の該当プロジェクト。
// 新形式のリンクにある行番号を優先し、無ければプロジェクト名（日英どちらでも）で探す
function findProjectInfo(speech, projects) {
  var norm = function (s) { return (s || '').replace(/\s+/g, '').toLowerCase(); };
  var byRow = projects.filter(function (p) { return speech.project_row && p.row === speech.project_row; })[0];
  if (byRow) return byRow;
  var name = norm(speech.project);
  if (!name) return null;
  return projects.filter(function (p) { return norm(p.name_ja) === name || norm(p.name_en) === name; })[0] || null;
}

// Upcoming 表（日付は yyyy/mm/dd）から対象回を選ぶ。today も yyyy/mm/dd（日本時間）
// 次回：日付が今日以降の最初の回。当日：日付が今日の回（定期実行用。例会の無い日は null）
function selectNextMeeting(upcoming, today) {
  return (upcoming || []).filter(function (u) { return u.date >= today; })[0] || null;
}

function selectTodaysMeeting(upcoming, today) {
  return (upcoming || []).filter(function (u) { return u.date === today; })[0] || null;
}

// ===== html.js =====
// 小さな HTML パーサー。Apps Script には DOM が無いため自前で木を作る。
// クラブサポートシステムのページを読むのに必要な範囲だけを実装している。

var HTML_VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
var HTML_RAW_TEXT_TAGS = { script: 1, style: 1 };
// 開始タグが来たとき、閉じタグ省略のために暗黙に閉じる要素
var HTML_IMPLIED_END = {
  tr: ['td', 'th', 'tr'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  tbody: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  thead: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  tfoot: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  option: ['option'],
  optgroup: ['option', 'optgroup'],
  li: ['li'],
  p: ['p']
};
var HTML_BLOCK_TAGS = { div: 1, p: 1, tr: 1, table: 1, li: 1, ul: 1, ol: 1, h1: 1, h2: 1, h3: 1, h4: 1, form: 1 };

function htmlDecodeEntities(s) {
  var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
    if (e[0] === '#') {
      var code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isNaN(code) ? m : String.fromCodePoint(code);
    }
    var v = named[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function htmlParseAttrs(s) {
  var attrs = {};
  var re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    var v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs[m[1].toLowerCase()] = htmlDecodeEntities(v);
  }
  return attrs;
}

// 引用符の中の '>' を無視してタグの終わりを探す
function htmlFindTagEnd(html, i) {
  var quote = null;
  for (; i < html.length; i++) {
    var c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

function parseHtml(html) {
  var root = { tag: '#root', attrs: {}, children: [], parent: null };
  var stack = [root];
  var top = function () { return stack[stack.length - 1]; };
  var i = 0;
  var textStart = 0;

  function flushText(end) {
    if (end > textStart) {
      top().children.push({ text: htmlDecodeEntities(html.slice(textStart, end)) });
    }
  }

  while (i < html.length) {
    var lt = html.indexOf('<', i);
    if (lt === -1) break;
    i = lt;
    if (html.startsWith('<!--', i)) {
      flushText(i);
      var endComment = html.indexOf('-->', i + 4);
      i = textStart = endComment === -1 ? html.length : endComment + 3;
      continue;
    }
    var m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, i + 40));
    if (!m) {
      if (html[i + 1] === '!' || html[i + 1] === '?') {
        flushText(i);
        var endDecl = html.indexOf('>', i);
        i = textStart = endDecl === -1 ? html.length : endDecl + 1;
      } else {
        i++; // ただの '<' 文字
      }
      continue;
    }
    var end = htmlFindTagEnd(html, i + m[0].length);
    if (end === -1) break;
    flushText(i);
    var tag = m[2].toLowerCase();
    if (m[1]) {
      // 終了タグ：対応する開始タグまで閉じる。無ければ無視。
      // ブラウザと同じく table の境界は越えない（<th>…</td> のような誤記で外側の表を閉じないため）
      for (var k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
        if (stack[k].tag === 'table') break;
      }
      i = textStart = end + 1;
      continue;
    }
    var implied = HTML_IMPLIED_END[tag];
    if (implied) {
      while (stack.length > 1 && implied.indexOf(top().tag) !== -1) stack.pop();
    }
    var attrText = html.slice(i + m[0].length, end);
    var node = { tag: tag, attrs: htmlParseAttrs(attrText), children: [], parent: top() };
    top().children.push(node);
    i = textStart = end + 1;
    if (HTML_RAW_TEXT_TAGS[tag]) {
      var close = html.toLowerCase().indexOf('</' + tag, i);
      i = textStart = close === -1 ? html.length : close;
      continue;
    }
    if (!HTML_VOID_TAGS[tag] && !/\/\s*$/.test(attrText)) stack.push(node);
  }
  flushText(html.length);
  return root;
}

function htmlFindAll(node, pred, out) {
  out = out || [];
  var kids = node.children || [];
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c.tag) {
      if (pred(c)) out.push(c);
      htmlFindAll(c, pred, out);
    }
  }
  return out;
}

function htmlByTag(node, tag) {
  return htmlFindAll(node, function (n) { return n.tag === tag; });
}

function htmlHasClass(node, cls) {
  return (' ' + (node.attrs['class'] || '') + ' ').indexOf(' ' + cls + ' ') !== -1;
}

function htmlByClass(node, tag, cls) {
  return htmlFindAll(node, function (n) { return n.tag === tag && htmlHasClass(n, cls); });
}

// table 直下（tbody 等を含む）の行。入れ子の table の行は含めない
function htmlRows(table) {
  var rows = [];
  (table.children || []).forEach(function (c) {
    if (c.tag === 'tr') rows.push(c);
    else if (c.tag === 'tbody' || c.tag === 'thead' || c.tag === 'tfoot') {
      c.children.forEach(function (r) { if (r.tag === 'tr') rows.push(r); });
    }
  });
  return rows;
}

function htmlCells(row) {
  return (row.children || []).filter(function (c) { return c.tag === 'td' || c.tag === 'th'; });
}

// ブラウザの innerText に近い文字列。<br> とブロック要素の境目を改行にする
function htmlInnerText(node, skipTags) {
  var parts = [];
  (function walk(n) {
    if (n.text !== undefined) {
      parts.push(n.text.replace(/[ \t\n\r\f]+/g, ' '));
      return;
    }
    if (n.tag === 'br') { parts.push('\n'); return; }
    if (HTML_RAW_TEXT_TAGS[n.tag] || (skipTags && skipTags[n.tag])) return;
    var block = HTML_BLOCK_TAGS[n.tag];
    if (block) parts.push('\n');
    (n.children || []).forEach(walk);
    if (block) parts.push('\n');
  })(node);
  return parts.join('');
}

// ===== main.js =====
// Apps Script 側の処理：例会ページの取得 → 解析 → スプレッドシートのコピーに記入 → PDF 出力。
// このファイルだけが Google の API を使う。

var SITE_BASE = 'https://tmcsupport.coresv.com/shinjukubilingualpha/';
var SETTINGS_SHEET = '設定';
var OBJECTIVES_SHEET = 'プロジェクト目標';

function fetchText(url, options) {
  var opts = { muteHttpExceptions: true };
  Object.keys(options || {}).forEach(function (k) { opts[k] = options[k]; });
  var res = UrlFetchApp.fetch(url, opts);
  if (res.getResponseCode() !== 200) {
    throw new Error('取得に失敗しました（' + res.getResponseCode() + '）：' + url);
  }
  return res.getContentText('UTF-8');
}

function fetchMeeting(mtgid) {
  var page = fetchText(SITE_BASE + 'mtgDetail.php?mtgid=' + mtgid);
  // 出欠表はページ表示後に Ajax で読み込まれる。ブラウザと同じリクエストを送る
  var members = fetchText(SITE_BASE + 'mtgDetailGetMemberList.php', {
    method: 'post',
    payload: { mtgid: String(mtgid) },
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  return parseMeeting(page, members, mtgid);
}

// 「設定」シート：B1 = Zoom 情報（複数行）、B2 = 出力先フォルダの URL
function readSettings(ss) {
  var sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) throw new Error('「' + SETTINGS_SHEET + '」シートがありません');
  return {
    zoom: String(sh.getRange('B1').getValue()),
    folderUrl: String(sh.getRange('B2').getValue()).trim()
  };
}

function folderFromUrl(url) {
  var m = /folders\/([A-Za-z0-9_-]+)/.exec(url);
  var id = m ? m[1] : url;
  if (!id) throw new Error('「設定」シートの B2 に出力先フォルダの URL を入れてください');
  return DriveApp.getFolderById(id);
}

var AGENDA_LAST_COLUMN = 13; // M 列まで（N・O 列は右側のゲスト・会員欄）

// スピーチ 3 本の回：行を挿入し、複写元（スピーチ 2 のブロック / 論評 2 の行）の議事欄を複写する。
// 右側の欄は複写しない。B 列は挿入した行とその次の行の数式をつなぎ直す（開始時刻の連鎖を切らないため）
function applyInserts(sheet, inserts) {
  (inserts || []).forEach(function (ins) {
    sheet.insertRowsAfter(ins.after, ins.count);
    sheet.getRange(ins.from, 1, ins.count, AGENDA_LAST_COLUMN)
      .copyTo(sheet.getRange(ins.after + 1, 1, ins.count, AGENDA_LAST_COLUMN));
    for (var k = 0; k < ins.count; k++) sheet.setRowHeight(ins.after + 1 + k, sheet.getRowHeight(ins.from + k));
    for (var r = ins.after + 1; r <= ins.after + ins.count + 1; r++) {
      sheet.getRange(r, 2).setFormula('=B' + (r - 1) + '+C' + (r - 1));
    }
    var label = sheet.getRange(ins.label);
    label.setValue(String(label.getValue()).replace(/2(\s*)$/, '3$1'));
  });
}

function applyPlan(ss, plan) {
  var sheet = ss.getSheetByName(plan.sheet);
  applyInserts(sheet, plan.inserts);
  plan.cells.forEach(function (c) {
    var range = sheet.getRange(c.cell);
    if (c.minutes !== undefined) range.setValue(c.minutes / (24 * 60)); // 時刻値（1 日 = 1）
    else range.setValue(c.value);
  });
  // 使わないセッションのシートは隠す（PDF に出さない。手直し用に残す）
  ss.getSheetByName(plan.sheet === 'JE' ? 'EJ' : 'JE').hideSheet();
  var settings = ss.getSheetByName(SETTINGS_SHEET);
  if (settings) ss.deleteSheet(settings);

  var obj = ss.getSheetByName(OBJECTIVES_SHEET);
  var layout = objectiveLayout(plan.objectives);
  for (var i = 0; i < layout.extraSlots; i++) {
    // テンプレートの最後の枠（7〜8 行目）と同じ書式・高さの 2 行を追加
    var after = 8 + i * 2;
    var cols = obj.getMaxColumns();
    obj.insertRowsAfter(after, 2);
    obj.getRange(7, 1, 2, cols).copyTo(obj.getRange(after + 1, 1, 2, cols), { formatOnly: true });
    obj.setRowHeight(after + 1, obj.getRowHeight(7));
    obj.setRowHeight(after + 2, obj.getRowHeight(8));
  }
  layout.cells.forEach(function (c) { obj.getRange(c.cell).setValue(c.value); });
  // 印刷範囲の外に残っている古い罫線などがあると、PDF がそれも含めて 1 ページに縮小される。
  // コピーでは範囲外（D 列以降、最後の枠より下）を削除する
  var lastRow = 8 + layout.extraSlots * 2;
  if (obj.getMaxRows() > lastRow) obj.deleteRows(lastRow + 1, obj.getMaxRows() - lastRow);
  if (obj.getMaxColumns() > 3) obj.deleteColumns(4, obj.getMaxColumns() - 3);
  // テンプレートの字体「BIZ UDPゴシック」（日本語名）は Google では別の字体で表示され、
  // 折り返し位置の計算と PDF の描画がずれて行末が欠ける。Google Fonts の同じ字体名に置き換える
  obj.getRange(2, 2, lastRow - 1, 2).setFontFamily('BIZ UDPGothic');
  layout.hideRows.forEach(function (r) { obj.hideRows(r); });
  obj.hideRows(1); // 印刷範囲（B2 以降）の外にあるクラブミッションの行
}

function exportPdf(ss, name) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf' +
    '&size=A4&portrait=true&scale=4&gridlines=false&printtitle=false&sheetnames=false' +
    '&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER' +
    '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('PDF の出力に失敗しました（' + res.getResponseCode() + '）');
  return res.getBlob().setName(name + '.pdf');
}

var TIME_ZONE = 'Asia/Tokyo';
var SCHEDULE = { weekDay: 'THURSDAY', hour: 13 }; // 例会日（第 1・第 3 木曜）の 13 時台に実行
var SCHEDULE_HANDLER = 'scheduledCreateProgram';

function todayJst() {
  return Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy/MM/dd');
}

function fetchUpcoming() {
  return parseUpcomingFromHtml(fetchText(SITE_BASE));
}

// ① プログラム作成：クラブ用スプレッドシート（テンプレート）のコピーを出力フォルダに作って記入する
function createProgram(mtgid) {
  return createProgramFromMeeting(fetchMeeting(mtgid));
}

function createProgramFromMeeting(meeting, options) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = readSettings(ss);
  var folder = folderFromUrl(settings.folderUrl);
  var plan = buildFillPlan(meeting, { zoom: settings.zoom, findProject: function (s) { return findProjectInfo(s, PROJECTS); } });

  if (options && options.skipIfExists && folder.getFilesByName(plan.fileName).hasNext()) {
    Logger.log('第' + meeting.number + '回のプログラムは作成済みのため、何もしません');
    return null;
  }
  var copyFile = DriveApp.getFileById(ss.getId()).makeCopy(plan.fileName, folder);
  var copy = SpreadsheetApp.openById(copyFile.getId());
  applyPlan(copy, plan);
  SpreadsheetApp.flush();

  Logger.log('第' + meeting.number + '回のプログラムを作成しました：' + copy.getUrl());
  plan.warnings.forEach(function (w) { Logger.log('警告：' + w); });
  return { number: meeting.number, url: copy.getUrl(), warnings: plan.warnings };
}

// ② PDF 出力：①で作ったスプレッドシート（手直し後）を PDF にして同じフォルダに保存する
function exportProgramPdf() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SETTINGS_SHEET)) {
    throw new Error('ここはクラブ用のテンプレートです。「① プログラム作成」で作ったスプレッドシートを開いてから実行してください');
  }
  SpreadsheetApp.flush();
  var folder = DriveApp.getFileById(ss.getId()).getParents().next();
  var pdf = folder.createFile(exportPdf(ss, ss.getName()));
  Logger.log('PDF を保存しました：' + pdf.getUrl());
  return { url: pdf.getUrl() };
}

// 定期実行：例会の当日だけ、その回のプログラムを作る（作成済みなら何もしない）。PDF は人が確認してから出す
function scheduledCreateProgram() {
  runScheduled(todayJst());
}

function runScheduled(today) {
  var target = selectTodaysMeeting(fetchUpcoming(), today);
  if (!target) {
    Logger.log(today + ' は例会日ではないため、何もしません');
    return;
  }
  createProgramFromMeeting(fetchMeeting(target.mtgid), { skipIfExists: true });
}

function findScheduleTriggers() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === SCHEDULE_HANDLER; });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('例会プログラム')
    .addItem('① 次回のプログラムを作成', 'menuCreateNextProgram')
    .addItem('① 回を指定して作成（mtgid）', 'menuCreateProgramById')
    .addItem('② PDF 出力', 'menuExportPdf')
    .addSeparator()
    .addItem('定期実行をオンにする', 'menuScheduleOn')
    .addItem('定期実行をオフにする', 'menuScheduleOff')
    .addToUi();
}

function showLink(title, message, url) {
  var html = '<p style="font-family:sans-serif">' + message + '</p>' +
    '<p style="font-family:sans-serif"><a href="' + url + '" target="_blank">開く</a></p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(240), title);
}

function warningText(warnings) {
  return warnings.length ? '<br><br>注意：<br>' + warnings.map(function (w) { return '・' + w; }).join('<br>') : '';
}

function showCreated(r) {
  showLink('作成しました', '第' + r.number + '回のプログラムを作成しました。開いて内容を確認し、必要なら手直ししてから「② PDF 出力」を実行してください。' + warningText(r.warnings), r.url);
}

function menuCreateNextProgram() {
  var ui = SpreadsheetApp.getUi();
  var next = selectNextMeeting(fetchUpcoming(), todayJst());
  if (!next) { ui.alert('今後の例会が見つかりませんでした'); return; }
  var ok = ui.alert('プログラム作成', next.date + '　第' + next.number + '回例会のプログラムを作成します。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  showCreated(createProgram(next.mtgid));
}

function menuCreateProgramById() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('プログラム作成', '例会の mtgid（例会詳細ページの URL の mtgid= の数字）を入力してください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var mtgid = parseInt(res.getResponseText(), 10);
  if (!mtgid) { ui.alert('mtgid は数字で入力してください'); return; }
  showCreated(createProgram(mtgid));
}

function menuExportPdf() {
  var r = exportProgramPdf();
  showLink('PDF を保存しました', 'PDF を保存しました。', r.url);
}

function menuScheduleOn() {
  var ui = SpreadsheetApp.getUi();
  readSettings(SpreadsheetApp.getActiveSpreadsheet()); // テンプレート以外では使えないことを先に確認
  if (findScheduleTriggers().length) { ui.alert('定期実行はすでにオンです'); return; }
  ScriptApp.newTrigger(SCHEDULE_HANDLER).timeBased()
    .onWeekDay(ScriptApp.WeekDay[SCHEDULE.weekDay]).atHour(SCHEDULE.hour).inTimezone(TIME_ZONE).create();
  ui.alert('定期実行をオンにしました。毎週木曜 13 時台に、その日が例会日ならプログラムを作成します（PDF 出力は手動）。\n※ オンにした人のアカウントで実行されます。');
}

function menuScheduleOff() {
  var triggers = findScheduleTriggers();
  triggers.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getUi().alert(triggers.length ? '定期実行をオフにしました' : '定期実行はオンになっていません（オンにした本人のみオフにできます）');
}

// ===== parse.js =====
// 例会詳細ページ（または TOP ページ）の HTML から meeting オブジェクトを作る。
// 形式は docs/SPEC.md の「meeting.json の形式」を参照。

function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function textLines(s) {
  return (s || '').split(/\r?\n/).map(cleanText).filter(function (l) { return l !== ''; });
}

function cellText(node) {
  return cleanText(htmlInnerText(node));
}

function findTable(doc, pred) {
  var tables = htmlByTag(doc, 'table');
  for (var i = 0; i < tables.length; i++) {
    var rows = htmlRows(tables[i]);
    if (rows.length > 0 && pred(tables[i], rows)) return tables[i];
  }
  return null;
}

// 担当欄は <select> の選択肢。表示は「山田 太郎さん（ ○ ）」形式なので括弧部分を除く
function selectedName(cell) {
  var opts = htmlByTag(cell, 'option');
  for (var i = 0; i < opts.length; i++) {
    var o = opts[i];
    if (o.attrs.selected !== undefined && o.attrs.value !== '-1') {
      return cleanText(htmlInnerText(o).replace(/（[^（）]*）\s*$/, ''));
    }
  }
  return '';
}

function removeSan(name) {
  return name.replace(/さん$/, '');
}

var TIME_LIMIT_PATTERNS = [
  /[（(]?\s*(\d+)\s*分\s*から\s*(\d+)\s*分\s*[）)]?/,
  /[（(]?\s*(\d+)\s*min\w*\s*[-~～]\s*(\d+)\s*min\w*\s*[）)]?/,
  /[（(]?\s*(\d+)\s*[-~～]\s*(\d+)\s*(分|min\w*)\s*[）)]?/
];

// 旧形式：パス名 / 「L3 知識を増やす」 / プロジェクト名 の 3 行
// 新形式：パス名 / 「L2:プロジェクト名」 / （5分から7分） / プロジェクト一覧へのリンク
function parseProjectCell(cell) {
  var result = { path: '', level: '', level_name: '', project: '', time_limit: null, project_row: null };
  var div = htmlByClass(cell, 'div', 'roleDetailStr1')[0];
  if (!div) return result;
  // リンク先はプロジェクト一覧シートの該当行（…&range=A11）
  htmlByTag(div, 'a').forEach(function (a) {
    var r = /[?&]range=[A-Z]+(\d+)/.exec(a.attrs.href || '');
    if (r) result.project_row = parseInt(r[1], 10);
  });
  // 新しい形式では説明ページへのリンクが付くので、リンクの文字は読まない
  var text = htmlInnerText(div, { a: 1 });
  for (var i = 0; i < TIME_LIMIT_PATTERNS.length; i++) {
    var m = TIME_LIMIT_PATTERNS[i].exec(text);
    if (m) {
      result.time_limit = { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
      text = text.slice(0, m.index) + text.slice(m.index + m[0].length);
      break;
    }
  }
  var lines = textLines(text);
  if (lines.length >= 1) result.path = lines[0];
  if (lines.length >= 2) {
    var lvNew = /^(L\d+)\s*[:：]\s*(.*)$/.exec(lines[1]);
    var lv = /^(L\d+)\s*(.*)$/.exec(lines[1]);
    if (lvNew) {
      result.level = lvNew[1];
      result.project = lvNew[2];
      return result;
    }
    if (lv) {
      result.level = lv[1];
      result.level_name = lv[2];
    } else {
      result.level_name = lines[1];
    }
  }
  if (lines.length >= 3) result.project = lines[2];
  return result;
}

function parseMeetingInfo(doc) {
  var t = findTable(doc, function (t, rows) {
    var c = htmlCells(rows[0]);
    return rows.length >= 2 && c.length >= 5 && cellText(c[1]).indexOf('Mtg Title') === 0;
  });
  if (!t) throw new Error('例会基本情報の表が見つかりません');
  var cells = htmlCells(htmlRows(t)[1]);
  var num = /第(\d+)回/.exec(cellText(cells[1]));
  var lastLine = function (c) { var l = textLines(htmlInnerText(c)); return l.length ? l[l.length - 1] : ''; };
  return {
    date: cellText(cells[0]),
    number: num ? parseInt(num[1], 10) : 0,
    venue: lastLine(cells[3]),
    room: lastLine(cells[4])
  };
}

function parseGuests(doc) {
  var t = findTable(doc, function (t, rows) {
    return rows.length >= 2 && cellText(rows[0]).indexOf('Guests') === 0;
  });
  if (!t) return [];
  var guests = [];
  htmlRows(t).slice(1).forEach(function (row) {
    htmlByClass(row, 'div', 'nowrap').forEach(function (div) {
      var g = cellText(div);
      if (g) guests.push(g);
    });
  });
  return guests;
}

function parseRoleRows(doc) {
  var t = htmlByClass(doc, 'table', 'mainTbl')[0];
  if (!t) throw new Error('役割表（mainTbl）が見つかりません');
  return htmlRows(t).filter(function (r) { return (r.attrs.id || '').indexOf('roleTr_') === 0; });
}

function parseAttendance(doc) {
  var t = findTable(doc, function (t, rows) {
    return rows.length >= 3 && cellText(rows[0]).indexOf('Alphabetical Order') === 0;
  });
  if (!t) return [];
  var list = [];
  htmlRows(t).slice(2).forEach(function (row) {
    var cells = htmlCells(row);
    if (cells.length < 2) return;
    var name = cellText(cells[0]);
    // 「アサインなし さん」はシステムの空き枠用ダミー会員
    if (!name || name.indexOf('アサインなし') === 0) return;
    list.push({ name: name, mark: cellText(cells[1]) });
  });
  return list;
}

function parseUpcoming(doc) {
  var t = findTable(doc, function (t, rows) {
    // 例会詳細ページは 2 列、TOP ページは会場などを含む 5 列
    var c = htmlCells(rows[0]);
    return c.length >= 2 && cellText(c[0]).indexOf('Date') === 0 && cellText(c[1]).indexOf('Meeting Title') === 0;
  });
  if (!t) return [];
  var list = [];
  htmlRows(t).slice(1).forEach(function (row) {
    var cells = htmlCells(row);
    if (cells.length < 2) return;
    var num = /第(\d+)回/.exec(cellText(cells[1]));
    var id = 0;
    htmlByTag(cells[1], 'a').forEach(function (a) {
      var m = /showDetail\((\d+)\)/.exec(a.attrs.onclick || a.attrs.href || '');
      if (m) id = parseInt(m[1], 10);
    });
    list.push({ date: cellText(cells[0]), number: num ? parseInt(num[1], 10) : 0, mtgid: id });
  });
  return list;
}

// TOP ページなど、役割表の無いページからは Upcoming だけを読む
function parseUpcomingFromHtml(html) {
  return parseUpcoming(parseHtml(html));
}

// membersHtml：mtgDetailGetMemberList.php の応答。出欠表はページ本体には無く、
// ページ表示後に Ajax で読み込まれるため別に渡す
function parseMeeting(html, membersHtml, mtgid) {
  var doc = parseHtml(html);
  var info = parseMeetingInfo(doc);
  var roleRows = parseRoleRows(doc);

  var roles = {};
  var ja = [];
  var en = [];
  roleRows.forEach(function (row) {
    var cells = htmlCells(row);
    var role = cellText(cells[0]);
    var name = removeSan(selectedName(cells[1]));
    var sp = /^(準備スピーチ|Prepared Speech)\s*(\d+)$/.exec(role);
    if (!sp) {
      roles[role] = name;
      return;
    }
    if (!name) return;
    var speech = { slot: parseInt(sp[2], 10), speaker: name };
    var prj = parseProjectCell(cells[4]);
    Object.keys(prj).forEach(function (k) { speech[k] = prj[k]; });
    speech.title = cells.length > 5 ? cellText(cells[5]) : '';
    (sp[1] === '準備スピーチ' ? ja : en).push(speech);
  });

  var firstRole = roleRows.length ? cellText(htmlCells(roleRows[0])[0]) : '';
  var format;
  if (firstRole === '今夜のトーストマスター') format = 'JE';
  else if (firstRole === 'Toastmaster of the Evening') format = 'EJ';
  else throw new Error('JE/EJ を判定できません（先頭の役割：' + firstRole + '）');

  return {
    mtgid: mtgid || 0,
    date: info.date,
    number: info.number,
    venue: info.venue,
    room: info.room,
    format: format,
    guests: parseGuests(doc),
    roles: roles,
    speeches: { ja: ja, en: en },
    attendance: membersHtml ? parseAttendance(parseHtml(membersHtml)) : [],
    upcoming: parseUpcoming(doc)
  };
}

// ===== projects.js =====
// Pathways プロジェクトの説明（tools/build_projects.py で生成。直接編集しない）
// row はプロジェクト一覧シートの行番号（例会ページのリンクの range=A{row} と同じ）
var PROJECTS = [
  {"row": 5, "code": "8101", "level": "Lvl.1", "name_en": "Ice Breaker", "name_ja": "アイスブレーカー", "desc_en": "", "desc_ja": "このプロジェクトでは、最後に4～6分間のスピーチを発表します。これはすべてのトーストマスターがクラブで行う最初のスピーチです。\n\n目的：このプロジェクトの目的は、クラブに自己紹介を行い、パブリックスピーチの基本的な構造を学ぶことです。\n\n概要：クラブで自己紹介を行うためのトピックを選び、それについてスピーチを作成し発表します。スピーチには、ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルを選ぶことができます。"},
  {"row": 6, "code": "8103", "level": "Lvl.1", "name_en": "Writing a Speech with Purpose", "name_ja": "目的を持ってスピーチを書く", "desc_en": "In this project you will learn strategies for selecting a topic, defining a purpose, and producing a well-written and organized speech. You will learn different organizational structures for speeches, and how to create clear transitions between sections of your speech.\n\nPurpose: The purpose of this project is to learn or review basic methods for writing a speech and to present a well-organized speech on any topic.\n\nOverview: Select a topic that appeals to you. It can be anything. Be sure your topic is narrow enough to be an effective 5- to 7-minute speech. Clearly define your topic and consider your goal for your speech. Before you organize your speech, identify and express your purpose in a single sentence. Practice your speech and refine its organization. Present your speech at a club meeting.", "desc_ja": ""},
  {"row": 7, "code": "8104", "level": "Lvl.1", "name_en": "Introduction to Vocal Variety and Body Language", "name_ja": "ボーカルバラエティとボディランゲージ入門", "desc_en": "Purpose: The purpose of this project is to practice using vocal variety or body language to enhance a speech.\n\nOverview: Learn or review the importance of vocal variety and body language. Present a 5- to 7-minute speech on any topic at a club meeting. The primary focus of the evaluation is your vocal variety or your body language and gestures. You will identify the skills you are working on for your evaluator before you deliver your speech and be evaluated on those skills. Your speech can be persuasive, humorous, informational, or crafted in any style that appeals to you and supports your speech content.", "desc_ja": ""},
  {"row": 8, "code": "8100", "level": "Lvl.1", "name_en": "Evaluation and Feedback", "name_ja": "論評とフィードバック", "desc_en": "", "desc_ja": "このプロジェクトでは、効果的にフィードバックを受け取り、自身のパブリックスピーキングスキルとリーダーシップスキルを向上させるためにそれを適用するための戦略を学びます。また、技巧性に優れ、建設的なフィードバックを提供する方法も学びます。各々が必要とし、期待しているフィードバックのタイプを特定する方法や、フィードバックの中で肯定的な言葉を使うことの重要性、そしてフィードバックとアドバイスの違いについて学びます。\n\n目的：このプロジェクトの目的は、自由にトピックを選んでスピーチを行い、フィードバックを受け取り、そのフィードバックを次のスピーチに反映させることです。\n\n概要：最初の5～7分のスピーチのトピックを選択します。スピーチの後で、受けたフィードバックを慎重に確認します。クラブの別の例会で、最初のスピーチに対するフィードバックを反映した5～7分のスピーチを行います。同じスピーチを再度行っても、新しいスピーチを行ってもかまいません。2回目のスピーチでは、1回目のスピーチに対するフィードバックの一部または全部を反映させる必要があります。最後に、両方のスピーチが完了した後、クラブ例会で論評者を務め、他の会員のプレゼンテーションに関して建設的なフィードバックを提供します。"},
  {"row": 9, "code": "8207", "level": "Lvl.2", "name_en": "Understanding Your Leadership Style", "name_ja": "自分のリーダーシップスタイルを理解する", "desc_en": "", "desc_ja": "このプロジェクトでは、「リーダーシップの目的」「良きリーダーを定義する資質」「様々なリーダーシップの特性やスタイル」についての理解を深めます。自分が生まれながらに持つリーダーシップスタイルやリーダーシップ行動を特定し、これらがあなたがリーダーとして接する相手にどのような影響を与える可能性があるかについて学んでいきます。また、状況やリーダーシップを発揮する相手や状況に応じてリーダーシップスタイルやリーダーシップ行動を適応させることについても学んでいきます。\n\n目的：このプロジェクトの目的は、自分の主要なリーダーシップスタイルを明らかにすることです。\n\n概要：「自分のリーダーシップスタイルを見つける」質問票に必要事項を記入します。自分のリーダーシップスタイルが周りの人にどのような影響を与えるか、また自分と異なるスタイルを持つ人に対し、より効果的にリーダーシップを発揮するための調整法について考察します。クラブ例会で5～7分のスピーチを行い、自分のリーダーシップスタイルの一部の側面や、あるいはリーダーシップスタイル全般について共有します。「他の人と作業を行う際に自分が好むリーダーシップスタイル」「自分のスタイルとそれを状況に応じてどのように適応出来るか」「リーダーシップスタイル全般とそれらがグループにどのような影響を与えるか」などについて話すことができます。"},
  {"row": 10, "code": "8206", "level": "Lvl.2", "name_en": "Understanding Your Communication Style", "name_ja": "自分のコミュニケーションスタイルを理解する", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、様々なコミュニケーションスタイルについて学び、自\n\n概要：「自分のコミュニケーションスタイルを見つける」ための質問に答えて、自分のコミュニケーションスタイルを見出します。クラブ例会で、自分のコミュニケーションスタイルと、それが及ぼす仕事上や個人的な人間関係への影響について5～7分のスピーチを行います。自分のコミュニケーションスタイルについて話しにくい場合は、あなたがこれまでに体験したコミュニケーションスタイルと、それによる自分への影響について話すことも可能です。なお、このスピーチは、このプロジェクトの内容に関する報告であってはなりません。"},
  {"row": 11, "code": "8204", "level": "Lvl.2", "name_en": "Introduction to Toastmasters Mentoring", "name_ja": "TOASTMASTERS メンタリング入門", "desc_en": "", "desc_ja": "このプロジェクトでは、メンターシップについて学び、メンターとプロテジェの役割についての理解や Toastmasters のメンターとしてのあなたの可能性について洞察を深めます。\n\n目的：このプロジェクトの目的は、Toastmasters が描くメンタリング像を明確に定義することです。\n\n概要：あなたがプロテジェだった時についての5～7分スピーチを書き、発表します。メンターを持つことの影響と重要性を共有します。このスピーチは、このプロジェクトの内容に関する報告ではありません。"},
  {"row": 12, "code": "8205", "level": "Lvl.2", "name_en": "Managing Time", "name_ja": "時間管理", "desc_en": "", "desc_ja": "このプロジェクトでは、時間を管理し、様々な管理テクニックを見つけ、それらをスピーチや日常生活に取り入れる方法を学んでいきます。\n\n目的：このプロジェクトの目的は、自分の時間管理パターンを観察することです。\n\n概要：自由なトピックについての5～7分スピーチを作成します。スピーチを作成する過程で、時間管理戦略を改善する方法を検討するため、各タスクに要する時間を記録します。クラブの例会でスピーチをします。最後に、教育担当副会長にプロジェクト完了記録を提出します。"},
  {"row": 13, "code": "8202", "level": "", "name_en": "Cross-Cultural Understanding", "name_ja": "異文化間の理解", "desc_en": "", "desc_ja": ""},
  {"row": 14, "code": "8200", "level": "Lvl.2/3", "name_en": "Active Listening", "name_ja": "アクティブリスニング", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、他者の話を聴く能力を示すことです。\n\n概要：クラブ例会において、トピックスマスター (Topicsmaster) の役割を果たします。トピックスマスターとして、各スピーカーのテーブルトピックス (Table Topics®) スピーチにコメントし、あなたのアクティブリスニング能力を示します。例えば、「ありがとうございます。ガーデニングの良さについての説得力のある意見でした。誰もが自分の好きなことをする時間を持つ必要があると、あなたが強く感じていることが理解できました」とコメントするなどです。"},
  {"row": 15, "code": "8201", "level": "Lvl.2/3", "name_en": "Connect with Your Audience", "name_ja": "聴衆と気持ちを通わせる", "desc_en": "", "desc_ja": "このプロジェクトでは、異なる聴衆のタイプを識別し、それぞれに効果的にスピーチを伝える方法を学びます。\n\n目的：このプロジェクトの目的は、馴染みのない聴衆と気持ちを通わせるために必要なスキルを練習することです。\n\n概要：大部分の聴衆にとって馴染みのないトピックについて5～7分スピーチを展開します。あなたは所属する Toastmasters クラブでこのスピーチを行いますから、聴衆の嗜好や個性についてはよく知っていることでしょう。しかし、クラブ会員にとって耳新しかったり馴染みがないトピックを選択することによって、スピーチを行いながらその場で適応する練習を行うことができます。話をしながらあなたのトピックに対する聴衆の反応をチェックし、関心を維持するために必要に応じてその反応に適応してください。"},
  {"row": 16, "code": "8203", "level": "Lvl.2/3", "name_en": "Effective Body Language", "name_ja": "効果的なボディランゲージ", "desc_en": "", "desc_ja": "このプロジェクトでは、「感情や考え方を表現するために体を使うこと」「様々なボディーランゲージを認識すること」「パブリックスピーキングを行う際に、自信を示すジェスチャーを確認すること」について学んでいきます。また、非意図的な動作の認識を示す方法や、スピーチの内容を強化するジェスチャーの使い方についても学んでいきます。\n\n目的：このプロジェクトの目的は、自分の意図的・非意図的なボディーランゲージについての認識を持ってスピーチを発表し、また、スピーチ発表時の、言葉によらないコミュニケーションの取り方を学び、練習し、そして磨くことです。\n\n概要：動作やジェスチャーによる表現に適したトピックで、5～7分のスピーチを準備します。クラブでスピーチを行う前に、自分のプレゼンテーションを録画し、メンターや他の評論者からフィードバックを取得します。録画機器がない場合は、予定されたスピーチまでに、鏡の前でスピーチを行い、修正を行います。クラブの例会でスピーチをします。"},
  {"row": 17, "code": "8208", "level": "Lvl.2", "name_en": "Know Your Sense of Humor", "name_ja": "自分のユーモアセンスを知る", "desc_en": "", "desc_ja": "目的：このプロジェクトでは、ユーモアのあるエピソードを集め、ユーモアを交えたスピーチをするスキルを身につけていきます。\n\n概要：選択したトピックで、5～7分のスピーチをします。プレゼンテーションを面白いもの、またはユーモアあるものにするため、スピーチの中に1つ以上の逸話またはストーリーを入れます。"},
  {"row": 18, "code": "8307", "level": "Lvl.3", "name_en": "Negotiate the Best Outcome", "name_ja": "最良の成果を得るための交渉", "desc_en": "", "desc_ja": "このプロジェクトでは、異なった交渉スタイルを理解し、それらを適用することができるよう学んでいきます。また、相互利益をもたらす話し合いへの参加、共通点の探索・構築、当事者間における合意の促進、交渉中に要するプロフェッショナルな冷静さの維持についても学びます。\n\n目的：このプロジェクトの目的は、異なった種類の交渉、ならびに交渉時に使用できる戦略について学ぶことです。\n\n概要：あなたの過去または今後の交渉について5～7分のスピーチを展開します。交渉は、あなたが実際に参加したものか参加する予定のものである必要があります。過去に使用した戦略、あるいは今後の交渉で有益性が最も高いと思われる戦略を反映させたものを選択することができます。あなたのスピーチは、説得力のある形式、ユーモラスな形式、情報を提供する形式、あるいはあなたが良いと思い、スピーチ内容に沿っているものであれば、どのような形式でまとめてもかまいません。"},
  {"row": 19, "code": "8313", "level": "Lvl.3", "name_en": "Reaching Consensus", "name_ja": "合意達成", "desc_en": "", "desc_ja": "このプロジェクトでは、「意思決定過程にグループメンバー全員を参加させること」「すべての利害関係者からフィードバックやアイデアを取り入れ採用すること」「グループ全体が納得する成果の達成に向けて話し合いを導くこと」の重要性を認識することについて学んでいきます。\n\n目的：このプロジェクトの目的は、自由なトピックで合意達成の演習を行うためにグループと協力して取り組むことです。\n\n概要：プロジェクトで解説されたテクニックを適用し、クラブ例会中に、20分間でグループを合意に導く演習を行います。あなたとグループに難題を与えるトピックを選択します。ただし、時間枠内に合意達成がなされないと考えられるトピックは避けてください。（注：20分以内に合意に達成できなくても問題はありません）その後、その体験またはその決定について2～3分の最終スピーチを行います。"},
  {"row": 20, "code": "8320", "level": "Lvl.3", "name_en": "Engage Your Audience with Humor", "name_ja": "ユーモアで聴衆を引き付ける", "desc_en": "", "desc_ja": "目的：このプロジェクトでは、あなたのユーモアスタイルを明確にし、基本メッセージを中心としたスピーチにこれを適用します。\n\n概要：自分の意見と自分が面白いと思うことを交えた5～7分のスピーチをします。プレゼンテーションを面白く、またはユーモアのあるものにするため、少なくとも1つの逸話またはストーリーをスピーチに含めます。"},
  {"row": 21, "code": "8312", "level": "Lvl.3", "name_en": "Present a Proposal", "name_ja": "提案の提示", "desc_en": "", "desc_ja": "このプロジェクトでは、提案を発表するときに中心となる情報の選び方を学んでいきます。裏付けとなる証拠を用いて議論を展開し、現実的な解決策を発表できるように準備します。また、発表する解決策によって提供されるプラスの面がどのような不利益をも上回ることを示します。\n\n目的：このプロジェクトの目的は、提案を作成し発表する練習を行なうことです。\n\n概要：どの分野でも良いので、あなたの生活を改善する提案を作成します。提案は、仕事やプライベート、また Toastmasters クラブに関するものであってもかまいません。提案が所属クラブに関するものである場合は、適切な役員に相談してください。例えば、クラブ会員を増やす提案を行なう場合なら、会員担当副会長に相談します。例会での5～7分のスピーチで、提案の全部またはその一部を発表します。"},
  {"row": 22, "code": "8309", "level": "Lvl.3", "name_en": "Planning and Implementing", "name_ja": "計画と実行", "desc_en": "", "desc_ja": "このプロジェクトでは、「目的の達成」「必要なリソースの識別」「プロジェクト完了までの的確なモニタリング」を行なうための実際的な計画の策定を学んでいきます。\n\n目的：このプロジェクトの目的は、計画を立て実現させるための練習を行なうことです。\n\n概要：家族パーティー、小旅行、Toastmasters のテーマ例会、その他のイベントやプロジェクトなど、計画を必要とする任意の小規模プロジェクトを選択します。自分で、あるいは他の人の力を借りて、計画の策定・実行を行います。クラブ例会で、自分の経験について2～3分のレポート、または5～7分のスピーチを行います。すべての計画リソースの完了確認のため、25ページの「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 23, "code": "8316", "level": "Lvl.3", "name_en": "Understanding Emotional Intelligence", "name_ja": "心の知能指数について", "desc_en": "", "desc_ja": "このプロジェクトでは、心の知能の主要な要素を学んでいきます。また、「自分の感情を誠実に評価する方法」「感情を適切に表現する方法」「動機づけに関連する楽観性の重要性を理解する方法」「共感力を高める手法を用いる方法」についても学びます。\n\n目的：このプロジェクトの目的は、あなたの感情が人間関係にどのような影響を与えるかについて理解を深めることです。また、このプロジェクトは、他者の感情が自分の感情の状態にどのような影響を与えるかについて確認できるように考案されています。\n\n概要：最低2週間以上、自分の感情、および自分の感情が与える自分や他者への影響についての日誌をつけます。5～7分のスピーチを行い、自分の感情を記録することが及ぼす影響についてクラブ例会で話し合います。（注：自分の経験に含まれる親密的な部分を共有する必要はありません）最後に、日誌を完了した旨を表明するために、署名をした「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 24, "code": "8315", "level": "Lvl.3", "name_en": "Understanding Conflict Resolution", "name_ja": "対立の解消について", "desc_en": "", "desc_ja": "このプロジェクトでは、対立を解消するテクニックを見つけ、説明する方法と、別の視点に価値を置く方法を学んでいきます。また、ポジティブな相互のやり取りのテクニックを練習し、他のメンバー間の対立に介入する適切なタイミングを認識し、アクティブリスニングを採用してチーム内の対立の解消を進めます。\n\n目的：このプロジェクトの目的は、対立の解消に取り組むためのステップおよび戦略についての理解を深め、強化することです。\n\n概要：プロジェクト内の対立の解消についての動画アクティビティーを完了します。「対立にどう対処するか」「より強力な戦略をどのように作成できるか」「対立状況におけるあなたの最も優れた特性（複数可）」について話す5～7分のスピーチを作成します。また、動画学習の効果について共有することもできます。ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルのスピーチを選ぶことができます。このプロジェクトは、このプロジェクトの内容に関する報告や批評ではありません。"},
  {"row": 25, "code": "8308", "level": "Lvl.3", "name_en": "Persuasive Speaking", "name_ja": "説得力のある話し方", "desc_en": "", "desc_ja": "このプロジェクトでは、あなたの視点の論拠をあげ、選択したトピックにとって最も適切な説得力のあるスピーチのタイプを特定し、メッセージを力強く伝えるプレゼンテーションを作成する方法について学んでいきます。また、説得力のあるスピーチを行い、自分の説得力のスキルの効果を評価することについても学びます。\n\n目的：このプロジェクトの目的は、説得力のあるスピーチのタイプを理解し、クラブ例会で説得力のあるスピーチを行うことです。\n\n概要：説得力のある話し方へとつながるトピックを選択し、スピーチを作成します。クラブ例会で5～7分のスピーチを発表します。担当の教育担当副会長が非クラブイベント/グループを承認した場合は、スピーチ発表時に論評者が同席する必要があります。"},
  {"row": 26, "code": "8314", "level": "Lvl.3", "name_en": "Successful Collaboration", "name_ja": "成功する共同作業", "desc_en": "", "desc_ja": "このプロジェクトでは、「共同作業の利点について理解する」「共同作業を行うグループにもたらす個人的な強みを認識する」「グループの他のメンバーの強みに価値を置く」「グループ内の信頼を築くための環境づくりを行う」ことについて学んでいきます。\n\n目的：このプロジェクトの目的は、共同作業グループで作業に取り組むための戦略を紹介または見直すことです。\n\n概要：小規模チームで共同作業による意思決定に取り組みます。ここでの目標は、学んだ共同作業戦略をクラブ例会の企画などの小規模プロジェクトに適用することです。クラブ例会で共同作業過程について5～7分のスピーチを行います。このスピーチは、このプロジェクトの内容についての報告ではありませ。あなた自身のこと、あなたが学んだこと、またあなたの体験について気づいたことに関するスピーチを行ってください。"},
  {"row": 27, "code": "8303", "level": "Lvl.3", "name_en": "Develop a Communication Plan", "name_ja": "コミュニケーション計画を策定する", "desc_en": "", "desc_ja": "このプロジェクトでは、伝えたい中心となるメッセージをわかりやすく組み立て、コミュニケーション計画を策定する方法を学んでいきます。また、どのような聴衆を対象とするかを明確にして、メッセージの口調・論調を、その聴衆やその場の雰囲気に合わせることについても学びます。\n\n目的：このプロジェクトの目的は、コミュニケーション計画を策定する演習を行うことです。\n\n概要：任意のイベントや状況についてのコミュニケーション計画を策定します。計画は、実際のものでも仮定のものでもかまいません。クラブ例会で、あなたの経験について5～7分のスピーチを行います。計画過程、計画を策定する利点、あるいはその計画を実行したことによる影響などについて話してもよいでしょう。教育担当副会長に完成した計画を提示し、このプロジェクトの単位を受領してください。"},
  {"row": 28, "code": "8306", "level": "Lvl.3", "name_en": "Make Connections Through Networking", "name_ja": "ネットワーキングを通じて人脈を築く", "desc_en": "", "desc_ja": "このプロジェクトでは、気さくで熱心な自分を相手に知ってもらい、ネットワーク内の付き合いを維持し、人々との交流やつながりを通じて効果的にネットワーキングを行う方法を学んでいきます。また、相互に有益となる関係を培うために他者の関心事を受け入れ、ネットワーク内のすべての人々に対して有能でプロフェッショナルな協力者として行動する方法を学びます。\n\n目的：このプロジェクトの目的は、ネットワーキングを通じて人脈を築くための個人的な戦略を策定し、演習を行うことです。\n\n概要：ネットワーキングイベントへの参加準備を行い、参加します。イベント後に、クラブに向けて5～7分のスピーチを行います。スピーチには、あなたの体験談、学んだことの説明、ネットワーキングの利点についてのディスカッションなどを入れることができます。また、スピーチは個人的なことについてでも、ネットワーキングについての情報を提供するものであってもかまいません。Toastmasters 以外のイベントに参加する場合は、19ページの「プロジェクト完了記録」に署名のうえ、教育担当副会長に提出する必要があります。"},
  {"row": 29, "code": "8300", "level": "Lvl.3", "name_en": "Connect with Storytelling", "name_ja": "ストーリーテリングで聴衆とつながる", "desc_en": "", "desc_ja": "このプロジェクトでは、ストーリーテリングのテクニックと描写スキルを適用して、聴衆が共感を抱く興味深いプレゼンテーションを行う方法について学びます。ストーリーを語る時は、自分自身の経験に基づいたストーリーを作り、それを自分のスタイルで語りましょう。あなたが聴衆に求める感情的効果を引き出せるようなストーリーを作ります。\n\n目的：このプロジェクトの目的は、スピーチの中にストーリーを取り入れたり、そのものがストーリーで成り立つスピーチを行う練習をすることです。\n\n概要：すでにあるストーリー、あなたの人生についてのストーリー、またはあなたが作った架空のストーリーを選びます。クラブ例会で5～7分のスピーチを発表します。"},
  {"row": 30, "code": "8301", "level": "Lvl.3", "name_en": "Creating Effective Visual Aids", "name_ja": "効果的な視覚資料の作成", "desc_en": "", "desc_ja": "このプロジェクトでは、「プレゼンテーションのために適切な視覚資料を選択する方法」「効果的な視覚資料の作成方法」「各種視覚資料の最大限の活用方法」について学んでいきます。\n\n目的：このプロジェクトの目標は、スピーチ中にさまざまな視覚資料を選択・使用する演習を行うことです。\n\n概要：視覚資料の使用が役立つスピーチトピックを選択します。1種類以上、3種類以内の視覚資料を作成してプレゼンテーションを強化します。クラブ例会で5～7分のプレゼンテーションを行います。"},
  {"row": 31, "code": "8302", "level": "Lvl.3", "name_en": "Deliver Social Speeches", "name_ja": "ソーシャルスピーチを行う", "desc_en": "", "desc_ja": "このプロジェクトでは、会合に適したスピーチを作成する方法や、乾杯スピーチ、追悼スピーチ、受賞スピーチ、ならびに個人や団体を称賛するスピーチなどの特徴を認識する方法を学んでいきます。また、さまざまな状況においてスピーチに逸話を交えて個性化することについても学びます。\n\n目的：このプロジェクトの目的は、所属クラブ会員の前でソーシャルスピーチを行うことです。\n\n概要：2種類のソーシャルスピーチ（各3～4分）を作成し、2つのクラブ例会で発表します。ソーシャルスピーチを2種類選択します。テーマは自分が興味のあるものや、練習したいものなど、自由に選択することができます。"},
  {"row": 32, "code": "8304", "level": "Lvl.3", "name_en": "Focus on the Positive", "name_ja": "ポジティブな側面に焦点を当てる", "desc_en": "", "desc_ja": "このプロジェクトでは、あなたの人との相互関係を改善するための戦略について学んでいきます。また、自分の態度や考えを書き留め、自分の成果を認識することでリーダーシップスキルと協調スキルを向上させます。自分の生活においてポジティブな側面に焦点を合わせることは、建設的なやり方で人に手を差し伸べることに役立ちます。\n\n目的：このプロジェクトの目的は、自分の考えや気持ち、ならびに自分の反応が他者に与える影響ついて認識するための演習を行うことです。\n\n概要：「ポジティブな感情やネガティブな感情を抱いた時について」「努力と成果」「『ありがたい』と感じること3つ」など、最低2週間、自分の気持ちと態度についての日誌をつけます。自分や周りの人の行動の変化を記録し、評価します。自分の体験のいくつかの側面をクラブ例会で共有します。2～3分のレポート、または5～7分のスピーチを選択し、予定を立てます。 スピーチ終了後、日誌を完了したことを示すために、署名をした19ページの「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 33, "code": "8305", "level": "Lvl.3", "name_en": "Inspire Your Audience", "name_ja": "聴衆を奮い立たせる", "desc_en": "In this project, you will learn how to present a speech in an enthusiastic and inspiring fashion in order to establish a strong rapport with your audience.\n\nPurpose: The purpose of this project is to practice writing and delivering a speech that inspires others.\n\nOverview: Select a topic with the intent of inspiring your audience and prepare a 5- to 7-minute speech for your club. Your speech can be persuasive, humorous, informational, or crafted in any style that appeals to you and supports your speech content. If you receive prior approval from the Vice President Education, you may speak to a non-Toastmasters group. If you speak to a non-Toastmasters group, remember to invite your evaluator.", "desc_ja": "このプロジェクトでは、聴衆との強いラポールを築くために、熱意を示し、奮い立たせるスタイルでスピーチを行う方法を学んでいきます。\n\n目的：このプロジェクトの目的は、他者を奮い立たせるスピーチを書き、発表するための演習を行うことです。\n\n概要：聴衆を奮い立たせることを目的とするトピックを選択し、所属クラブで発表する5～7分のスピーチを作成します。"},
  {"row": 34, "code": "8310", "level": "Lvl.3", "name_en": "Prepare for an Interview", "name_ja": "面接に備える", "desc_en": "", "desc_ja": "このプロジェクトでは、「自分のことを中立的に評価すること」「自分の長所を特定し、それについて話すこと」「開発しようと計画している分野を認識する」「どんなタイプの面接・インタビューにおいても自分自身をうまく伝えること」について学んでいきます。\n\n目的：このプロジェクトの目的は、面接・インタビューで自分自身をうまく伝えるために必要なスキルを練習することです。\n\n概要：就職の面接、専門家インタビューなど、練習を行いたい面接・インタビューの種類を決定します。自分のスキルと能力を見直して準備を行います。プロジェクト内のリソースを完了してプレゼンテーションの前に面接官・インタビュアー役担当者に提供します。どの所属クラブ会員に面接官・インタビュアー役を担当してもらうかについては自由に決めることができますが、面接官・インタビュアー役担当者は論評者以外の人物である必要があります。クラブ例会における5～7分のロールプレー・プレゼンテーションで、自分のスキルや能力、経験をアピールするために面接官・インタビュアーからの質問に回答する練習を行います。"},
  {"row": 35, "code": "8317", "level": "Lvl.3", "name_en": "Understanding Vocal Variety", "name_ja": "ボーカルバラエティについて", "desc_en": "", "desc_ja": "このプロジェクトでは、「ボーカルバラエティによる影響についての認識」「スピーカーに耳を傾ける際の『ピッチ』『トーン』『声量』『ペース』の変化の識別」について学んでいきます。また、スピーチをセクション別に強調するため、「『ピッチ』『トーン』『声量』『速度』を効果的に調整するタイミングと方法」「プレゼンテーションを強化するためにボーカルバラエティを使い分けるタイミングと方法」についても学びます。そして、自分のボーカルバラエティのパターンについての知識を示し、聴衆のニーズに合わせてそのパターンを調整し、スピーチの質を向上させます。\n\n目的：このプロジェクトの目的は、ボーカルバラエティを使い分ける練習を行い、スピーチを強化することです。\n\n概要：ボーカルバラエティの重要性を学習/復習します。このプロジェクト内の演習を行い、ボーカルバラエティを使い分けるスキルを向上させます。その後、クラブ例会で5～7分のスピーチを発表します。スピーチのトピックは自由に選ぶことができます。論評の主な焦点は、あなたのボーカルバラエティの使い分けに置かれます。"},
  {"row": 36, "code": "8318", "level": "Lvl.3", "name_en": "Using Descriptive Language", "name_ja": "記述的言語の使用", "desc_en": "", "desc_ja": "このプロジェクトでは、文字通りの言葉と比喩的な言葉の違いを認識し、それぞれの言葉を使い分ける方法について学んでいきます。また、スピーチに動詞、形容詞、副詞を組み入れて生き生きとした説明を作り上げ、文学的な要素や言葉を使用して感動的なスピーチを作成します。\n\n目的：このプロジェクトの目的は、聴衆の関心を高め、インパクトを強くする言葉を加えることを意識して、スピーチを書く演習を行うことです。\n\n概要：スピーチのトピックは自由に選択することができます。トピックについて詳細な説明を行う5～7分のスピーチを作成し、クラブ例会で発表します。"},
  {"row": 37, "code": "8319", "level": "Lvl.3", "name_en": "Using Presentation Software", "name_ja": "プレゼンテーションソフトウェアの使用", "desc_en": "", "desc_ja": "このプロジェクトでは、「プレゼンテーションソフトウェアの使用が役立つトピックの特定」「聴衆の気を引き情報豊かな視覚資料をデザインする最善の方法についての理解」「明確かつ簡潔な視覚的に優れたスライドの作成」「プレゼンテーションソフトウェアをツールとして使用してプレゼンテーションを行う能力を示すこと」について学んでいきます。\n\n目的：このプロジェクトの目的は、スピーチを強化・補助するためのスライドを作成・使用するための基本的なプレゼンテーションソフトウェアの戦略を紹介または見直しを行うことです。\n\n概要：テクノロジーを活用した視覚的なプレゼンテーションに向いているスピーチトピックを選択します。このプロジェクトの内容と自らのリサーチを使用し、スライドの作成に役立てます。作成したスライドを使用して5～7分のスピーチを行います。スピーチは、ユーモアのあるスタイル、論証的なスタイル、情報を提供するスタイルなどから選ぶことができ、小話や実話を含むこともできます。"},
  {"row": 38, "code": "8321", "level": "Lvl.3", "name_en": "Researching and Presenting", "name_ja": "リサーチとプレゼンテーション", "desc_en": "", "desc_ja": "このプロジェクトでは、トピックの選択、綿密で正確なリサーチの実施、構成の優れたスピーチの作成のための戦略を学びます。また、スピーチのためのさまざまな構成構造、スピーチの各セクションを明確に結びつなぐ移行部の作成、文献の引用方法についても学びます。\n\n目的：このプロジェクトの目的は、基本的なリサーチ方法の学習や見直しを行い、どのようなトピックであっても、よく構成され、よくリサーチされたスピーチを発表することです。\n\n概要：まだよく知らないトピックや、これからもっと学びたいトピックを選択します。5〜7分の効果的なスピーチとなるよう、トピックの範囲が充分に絞られていることを確認します。本プロジェクトの説明に従い、トピックをリサーチし、情報の整理を開始します。スピーチを練習し、構成の推敲を重ねます。クラブの例会でスピーチをします。"},
  {"row": 39, "code": "8406", "level": "Lvl.4", "name_en": "Manage Change", "name_ja": "変更の管理", "desc_en": "", "desc_ja": "このプロジェクトでは、「変更を実施するための計画の立て方」「変更により影響を受ける全利害関係者に届くコミュニケーション計画の立て方」「成功を妨げる主要な障害の認識方法」「それらの障害を解消するプロセスの確立方法」について学んでいきます。\n\n目的：このプロジェクトの目的は、変更管理計画を立てる演習を行うことです。\n\n概要：実際または架空の状況についての変更管理計画を立てます。プライベート、Toastmasters、または仕事のいずれかにおいて、過去に生じた変更、あるいは今後予定されている変更に基づく計画を立てることができます。所属クラブで5～7分のスピーチを行いあなたの変更管理計画を共有します。スピーチには、ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルを選ぶことができます。また、このスピーチは本プロジェクトで学んだことに関するレポートではなく、あなたの計画について、またこの変更が自分および他者に対してどのような利点をもたらすのかについての概要です。"},
  {"row": 40, "code": "8403", "level": "Lvl.4", "name_en": "Improvement Through Positive Coaching", "name_ja": "前向きなコーチングによる改善", "desc_en": "", "desc_ja": "このプロジェクトでは、「コーチングにより他者に良い影響を与える方法」「コーチングする相手との関係を育むことの重要性」について学びます。また、「目標の達成やスキルの習得に取り組む個人を支援するための戦略」「そのプロセスにおいて効果的なフィードバックを提供する方法」に重点的に取り組んでいきます。\n\n目的：このプロジェクトの目的は、あなたの専門知識によってメリットを受けられる仲間の会員、または Toastmasters 以外の人をコーチングするためのスキルを開発し、適用することです。\n\n概要：1つのプロジェクトを通じて、クラブ例会以外の機会にコーチングを行います。教育担当副会長との話し合いにより、クラブ会員をコーチングするか、Toastmasters 以外の人をコーチングするかについての計画を立てます。コーチングの役目を果たした後、クラブ例会でコーチとしてのあなたの体験について5～7分のスピーチを行います。ユーモアのあるスタイル、情報を提供するスタイルなど、スピーチの内容にふさわしいスピーチのスタイルを選ぶことができます。"},
  {"row": 41, "code": "8415", "level": "Lvl.4", "name_en": "The Power of Humor in an Impromptu Speech", "name_ja": "即興スピーチにおけるユーモアの効果", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、即興スピーチをまとめる方法を学び、リハーサルしておいたストーリーをプレゼンテーションの中にうまく組み込む練習をすることです。\n\n概要：2～3分のスピーチを2種類行います。最初のスピーチをする準備ができたら、例会司会者が17ページの即興スピーチトピックのリソースの中からトピックを1つ選びます。スピーチの長さは2～3分とし、トピックと関連した逸話を1つ以上含めます。最初のスピーチが終わったら、別のトピックで2つ目の2～3分のスピーチを行います。いずれのトピックも予備知識なしで、無作為に選ぶ必要があります。"},
  {"row": 42, "code": "8405", "level": "Lvl.4", "name_en": "Leading Your Team", "name_ja": "チームでのリーダーシップの発揮", "desc_en": "", "desc_ja": "このプロジェクトでは、グループに適切な関連情報を伝え、小規模グループのサポートを得ながらタスクを遂行し、基本的なリーダーシップスキルを活用していきます。\n\n目的：このプロジェクトの目的は、プロジェクトの完了に向けて小規模なチームを率いることです。\n\n概要：2～4人からなるチームを作り、立案したプロジェクトの達成に向けてチームを率います。（注：提案については「プロジェクトチェックリスト」リソースを参照のこと）プロジェクトの遂行後、チームを率いることにまつわるあなた自身のエピソードまたは体験について5～7分のスピーチを行います。ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルのスピーチを選ぶことができます。"},
  {"row": 43, "code": "8411", "level": "Lvl.4", "name_en": "Motivate Others", "name_ja": "他者の意欲を高める", "desc_en": "", "desc_ja": "このプロジェクトでは、「他者の意欲を高めるための様々な方法」「他者との関係を強化・育成する方法」「他者の内面の成長を促す方法」について学んでいきます。また、励ましならびに有益なフィードバックを他者に与える方法についても学びます。\n\n目的：このプロジェクトの目的は、プロジェクトの完了を通じてチームメンバーの意欲を高めるのに必要なスキルを磨くことです。\n\n概要：クラブに利益をもたらすことを目的としたプロジェクトの作成と完了を支える3～4人のチームを作ります。プロジェクト内の情報を活用して各チームメンバーに向けた意欲を高める戦略を構築します。プロジェクト終了後、チームメンバーと1人以上のクラブ役員に360度評価への記入を依頼し、あなたのコミュニケーションおよびリーダーシップに対するフィードバックを提供してもらうこともできます。クラブ例会で、あなたの体験について5～7分のスピーチを行います。このスピーチは、このプロジェクトの内容についての報告ではありません。"},
  {"row": 44, "code": "8404", "level": "Lvl.4", "name_en": "Leading in Difficult Situations", "name_ja": "困難な状況でのリーダーシップの発揮", "desc_en": "", "desc_ja": "このプロジェクトでは、「困難な状況に対処するための基礎」ならびに「緊張を和らげ課題を解決するためにこれらの戦略を適用する方法」を学んでいきます。また、このプロジェクトの履修により、難しい変化に直面したり、課題の原因を理解するために状況分析を行ったりする際に、前向きな姿勢を維持することの重要性を認識するようになります。\n\n目的：このプロジェクトの目的は、最終計画への予期せぬ変更に適応する戦略を演習することです。\n\n概要：任意のイベントまたは一連の目標に関するプロジェクト計画を企画し、完成させます。計画は、実際のものでも架空のものでもかまいません。このプロジェクトを最善の形で成功へ導くために、計画には、可能な限り多くの詳細情報を加えます。クラブ例会で、あなたの計画を共有するため5～7分のスピーチをします。23ページの「計画の妨げとなる事がら」リソースのコピーをクラブ会員に配布し、あなたの計画に起こり得る混乱について話し合う場を2～3分間設けます。クラブ会員が提示する問題を聞き、その場で解決策を提示します。クラブ例会で行うこの課題の所要時間は15～20分です。"},
  {"row": 45, "code": "8401", "level": "Lvl.4", "name_en": "Communicate Change", "name_ja": "変更の伝え方", "desc_en": "", "desc_ja": "このプロジェクトでは、以下の手順に基づきコミュニケーションプランを立てます。\n\n目的：このプロジェクトの目的は、グループや組織に対して効果的に変更事項を伝えるために必要なスキルの演習を行うことです。\n\n概要：変更により影響を受ける聞き手に対して変更事項を伝えるための計画を策定します。クラブ例会で5～7分のスピーチにより変更事項を伝えます。所属クラブや、あなたの生活におけるその他のグループに影響を与える実際の変更や架空の変更について話すことができます。このスピーチは、このプロジェクトの内容についてのレポートではありませんが、あなたが実際の変更や架空の変更をどのように伝えるかについてのスピーチです。"},
  {"row": 46, "code": "8408", "level": "Lvl.4", "name_en": "Manage Projects Successfully", "name_ja": "プロジェクトの効果的な管理", "desc_en": "", "desc_ja": "このプロジェクトでは、プロジェクトマネージャーとしてのあなたの強みを認識する方法について学びます。この課題を完了する過程で、あなたは「利害関係者との信頼関係を築くこと」「チームとの適切な関係を育むこと」「期日を守るために時間を管理すること」の重要性を認識していきます。また、「タスクを委託するスキル」「リソース管理スキル」「行動の先例を示すスキル」も学びます。\n\n目的：このプロジェクトの目的は、「計画の作成」「チームの構築」「チームとの連携による計画の実行」の演習を行うことです。\n\n概要：3～4人からなるチームを結成し、プロジェクトを選択して開始します。プロジェクトの計画を作成し、所属クラブに向けて2～3分のスピーチによりその計画を発表します。その後、チームと共にプロジェクトを完了します。最後に、あなたの体験について、5～7分のスピーチを行います。このスピーチは、ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルを選ぶことができます。スピーチは、このプロジェクトの内容についてのレポートではなく、あなたが学んだことを応用した、自身の体験を反映したものでなくてはなりません。"},
  {"row": 47, "code": "8409", "level": "Lvl.4", "name_en": "Managing a Difficult Audience", "name_ja": "扱いにくい聴衆への対処", "desc_en": "", "desc_ja": "このプロジェクトでは、気難しい参加者に共通する行動、ならびにそれらの行動に冷静かつ効果的に、またプロフェッショナルな姿勢で対応する方法について学んでいきます。\n\n目的：このプロジェクトの目的は、Toastmasters のクラブ以外でプレゼンテーションを行う際に、聴衆による課題に対応するために必要なスキルを演習することです。\n\n概要：自由なトピックによる5～7分のスピーチを準備します。新しいスピーチを作成することも、以前に発表したスピーチを使用することもできます。スピーチの内容ではなく、聴衆による妨げへの対応の仕方についての評価が行われます。クラブ例会前に、「ロールプレイ課題」リソースを例会司会者と教育担当副会長に送付します。スピーチ中に、あなたの妨げとなる様々なタイプの気難しい聴衆に対応します。スピーチと聴衆への対応のプロセスには12～15分かかります。\n\nこのプロジェクトにはロールプレイがあります。予定されたスピーチの1週間前に、プロジェクト要件についての確認のため、例会司会者および教育担当副会長に連絡を取る必要があります。例会司会者または教育担当副会長にクラブ会員と連絡を取ってもらい、課題のためのロールプレイの調整を行ってもらいます。"},
  {"row": 48, "code": "8412", "level": "Lvl.4", "name_en": "Public Relations Strategies", "name_ja": "広報戦略", "desc_en": "", "desc_ja": "このプロジェクトでは、組織に対する認識を高め、広報戦略を策定し、様々な広報戦術を活用することについて学んでいきます。また、対象となる聴衆に向けて情報を伝達するために利用可能なメディアチャンネルの識別についても学びます。\n\n目的：このプロジェクトの目的は、グループや状況に対して効果的に広報戦略を行うためのスキルの演習を行うことです。\n\n概要：実在または架空のグループあるいは状況に対する広報計画を作成します。その計画が所属クラブに関するものである場合は、広報担当副会長およびクラブ会長との話し合いを経ない限り、架空のものである必要があります。5～7分のスピーチで、あなたの計画をクラブ例会で共有します。このスピーチは本プロジェクトの内容についてのレポートではありませんが、学んだことをどのように応用するか、またできるかについての一例となるものです。"},
  {"row": 49, "code": "8400", "level": "Lvl.4", "name_en": "Building a Social Media Presence", "name_ja": "ソーシャルメディアで存在感を築く", "desc_en": "", "desc_ja": "このプロジェクトでは、様々な種類のオンラインコミュニケーションを最大限に活用する方法について検討していきます。自分や組織のプロモーションを行うために、オンラインプロフィールを作成・維持します。また、インターネットプライバシーの重要性を認識し、個人情報を保護することについて学びます。さらには、プロモーション目標の達成や、オンラインでの人とのポジティブなやり取りを促進する適切なセルフイメージを示すことについても学びます。\n\n目的：このプロジェクトの目的は、既に確立されている、あるいは新規のソーシャルメディアでの存在感を高めるために、あなたのソーシャルメディアへの理解を応用することです。\n\n概要：このプロジェクトおよび独自のリサーチを活用し、新規/既存のソーシャルメディアで存在感を高めます。個人的な目標（旧友への連絡、ブログのプロモーションなど）、または仕事の目標（ビジネスや組織のプロモーションなど）に焦点を当てることができます。あなたとあなたの目的に最もふさわしいと思うツールを使用します。目標の達成後、「成果」「体験」「ソーシャルメディアのメリット」についてクラブで5～7分のスピーチを行います。プロジェクト完了単位取得のため、17ページの「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 50, "code": "8402", "level": "Lvl.4", "name_en": "Create a Podcast", "name_ja": "ポッドキャストの作成", "desc_en": "", "desc_ja": "このプロジェクトでは、あなたが個人的に関心を持っていることの中から1つ以上をポッドキャストの題材として選び、興味深いコンテンツを作成し、まとまりのある番組に構成し、その番組を録音/録画して、インターネットにアップロードします。また、ポッドキャストのメッセージ性を高めるため、あなたの持つパブリックスピーキングスキルを活用します。\n\n目的：このプロジェクトの目的は、ポッドキャストの構成および発表に必要な初歩的スキルを学ぶことです。\n\n概要：このプロジェクトおよび独自のリサーチを活用してポッドキャストを作成します。60分以上のコンテンツを録音/録画します。エピソードは自由に分割することができます。各エピソードは少なくとも10分以上必要ですが、トピックやスタイルに合わせてもっと長くすることもできます。すべてのコンテンツの録音/録画後、クラブで5～10分のセグメントを再生します。2～3分のスピーチでこのセグメントを紹介します。"},
  {"row": 51, "code": "8407", "level": "Lvl.4", "name_en": "Manage Online Meetings", "name_ja": "オンラインミーティングの管理", "desc_en": "", "desc_ja": "このプロジェクトでは、「オンラインミーティングとウェビナーを効果的に実施する方法」「必要な視覚資料やその他の補足資料を準備・整理する方法」「自信を持ってオンラインミーティングやウェビナーを進行する方法」について学んでいきます。\n\n目的：このプロジェクトの目的は、オンラインミーティングのファシリテーション、またはウェビナーの進行の演習を行うことです\n\n概要：会員仲間との20～25分のオンラインミーティング、または会員仲間に向けた20～25分のウェビナー（視覚資料を使用）を行います。ミーティング/ウェビナーのトピックはあなたが決定します。自分のニーズおよび地域に最も適したソフトウェアをリサーチし、使用します。オンラインミーティング/ウェビナーに論評者を招待し参加してもらいます。Toastmasters 以外でこの課題を完了する場合は、教育担当副会長からの承認を得て、論評者を招待する必要があります。"},
  {"row": 52, "code": "8413", "level": "Lvl.4", "name_en": "Question-and-Answer Session", "name_ja": "質疑応答セッション", "desc_en": "", "desc_ja": "このプロジェクトでは、「質問に回答するための準備方法」と「明確にかつ簡潔に自信を持って情報を提供する方法」について学んでいきます。また、気難しい聴衆への対処方法についても学びます。\n\n目的：このプロジェクトの目的は、質疑応答セッションの進行について学び、練習することです。\n\n概要：あなたが特に精通しているトピックを選択します。選択したトピックについてスピーチを作成し、スピーチの発表後、質疑応答セッションを行います。スピーチと質疑応答セッションは、合わせて15～20分以内に収める必要があります。両方のセグメントを完了できるよう、時間を効果的に使います。"},
  {"row": 53, "code": "8414", "level": "Lvl.4", "name_en": "Write a Compelling Blog", "name_ja": "説得力のあるブログを書く", "desc_en": "", "desc_ja": "このプロジェクトでは、「説得力のあるブログの開設・作成における基本構造」「読者をうまく惹きつける方法」「オンラインにおけるプライバシーおよびセキュリティの重要性」について学んでいきます。\n\n目的：このプロジェクトの目的は、ブログの作成・維持に必要とされるスキルの復習・学習を行うことです。\n\n概要：1か月間に最低8回ブログへの投稿を行います。ブログは新しいものでも、既存のものでもかまいません。所属クラブを代表してブログを作成する場合には、そのための承認を、教育担当副会長から得る必要があります。自分のブログ体験による影響について、クラブ例会で2～3分のスピーチを行います。ブログをクラブ会員に論評してもらうことを選ぶこともできます。このプロジェクトの単位を取得するため、署名した21ページの「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 54, "code": "8504", "level": "Lvl.5", "name_en": "Lead in Any Situation", "name_ja": "どんな状況でもリーダーシップを発揮する", "desc_en": "", "desc_ja": "このプロジェクトでは、「なぜリーダーシップが状況的であるのかについての探求」「状況的リーダーシップスタイルの特定」「自分のリーダーシップスタイルを状況に適応させる必要性の認識」を行います。また、「リーダーシップスタイルの指針とするための個人のコンピテンシーおよび責任レベルの評価」「特定のリーダーシップスタイルが最も効果的である状況の認識」についても学んでいきます。\n\n目的：このプロジェクトの目的は、ボランティア組織またはその他の組織で効果的にリーダーシップを発揮するために必要なスキルを適用することです。\n\n概要：最低6ヶ月間、Toastmasters（レベル不問）、その他のボランティア組織、または職場におけるリーダーとしての役割を引き受けます。役割担当中、同僚に360度評価の実施を依頼します。リーダーとしての体験にまつわる8～10分のスピーチを行います。このスピーチは、ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルを選ぶことができます。また、スピーチはこのプロジェクトの内容についてのレポートではなく、自らの体験か360度評価の影響、もしくはその両方を反映するものである必要があります。"},
  {"row": 55, "code": "8512", "level": "Lvl.5", "name_en": "Deliver Your Message with Humor", "name_ja": "ユーモアを交えてメッセージを伝える", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、長めのユーモアあるスピーチを作成・発表する演習を行うことです。\n\n概要：18～22分のユーモアある基調講演を作成し、発表します。スピーチとスタイルに合うのであれば、視覚資料を使用することもできます。教育担当副会長から事前承認を受けた場合は、Toastmasters 以外の聴衆に向けてスピーチを行うことができます。"},
  {"row": 56, "code": "8507", "level": "Lvl.5", "name_en": "Manage Successful Events", "name_ja": "イベントの効果的な管理", "desc_en": "", "desc_ja": "このプロジェクトでは、「チームでイベントをコーディネートすること」「チームならびにイベント全体の主要連絡窓口としての役割の遂行」「不測の事態に対処するための準備」「参加者に最適な体験を提供すること」について学んでいきます。また、「予算・リソースの管理方法」「ミーティング・タスクの監督方法」「職務の委譲方法」についても学びます。\n\n目的：このプロジェクトの目的は、イベントの計画、運営、主導、実施の演習を行うことです。\n\n概要：自由に選択したイベントの計画、コーディネート、遂行を行います。このプロジェクトには、イベントの要素全てについて計画するためのツールが含まれています。イベント後、クラブで5～7分のスピーチを行います。開催されたイベントの「計画プロセス」「チーム」「運営」による影響を共有します。ユーモアのあるスタイル、情報を提供するスタイルなど、自分がいいと思ったスタイルのスピーチを選ぶことができます。なお、スピーチは、このプロジェクトの内容に関するレポートではありません。"},
  {"row": 57, "code": "8511", "level": "Lvl.5", "name_en": "Team Building", "name_ja": "チームビルディング", "desc_en": "", "desc_ja": "このプロジェクトでは、「チームの成功を支える環境作り」「チームビルディングの利点の伝達」「魅力あるチームビルディングイベントの企画において成功する共同取り組み」「イベント前の必要タスクの完遂のための他者との調整」について学んでいきます。また、チームビルディングアクティビティを効果的に導入・進行・報告するために必要なチームメンバーのスキル開発も行います。\n\n目的：このプロジェクトの目的は、結束力の強いチームを築き、イベントを開催するのに必要なスキルを演習することです。\n\n概要：トーストマスターズクラブまたはその他の環境でチームビルディングイベントを企画・開催するための小規模チームを作り、協力して取り組みます。Toastmasters 以外のイベントには、所属クラブの教育担当副会長による承認、および所属クラブのリーダー1名のイベントへの参加が必要となります。イベントの前に、クラブ例会で2～3分のレポートを発表し、計画について共有します。イベント後、クラブに向けて5～7分のスピーチを行います。スピーチの内容は自由ですが、「あなたのイベント」「リーダーを務めたことがあなたとチームに与えた影響」または「チーム作りがリーダーとしてのあなたに与えた影響」についてのものである必要があります。"},
  {"row": 58, "code": "8501", "level": "Lvl.5", "name_en": "Develop Your Vision", "name_ja": "ビジョンの構築", "desc_en": "", "desc_ja": "このプロジェクトでは、仕事や生活のためのビジョンを構築し、ビジョンに向けて進むための達成可能なタスクのアウトラインをまとめ、その過程についてのスピーチを作成していきます。そして、あなたのビジョンを聴衆に向けて簡潔に印象的で積極的な言葉を使用して発表します。\n\n目的：このプロジェクトの目的は、仕事や生活、または組織のための詳細なビジョンを構築することです。\n\n概要：ビジョンを構築し、クラブ例会で5～7分のスピーチを行います。このプロジェクトに含まれるリソースを使用して計画を実行するためのタイムラインを設定します。後の例会で5～7分のスピーチを行い、ビジョンを実現するための計画を発表します。プロジェクトに含まれているすべてのリソースを完了したことを示すため、署名した24ページの「プロジェクト完了記録」を教育担当副会長に提出します。"},
  {"row": 59, "code": "8503", "level": "Lvl.5", "name_en": "High Performance Leadership", "name_ja": "ハイパフォーマンスリーダーシップ", "desc_en": "", "desc_ja": "このプロジェクトでは、自分が設定したプロジェクトの完了を目指してチームを構築し、そのメンバーを率いていきます。また、「明確な目標を含む包括的な計画の策定」「チームメンバーへのタスク委譲」「プロジェクトを通して個々のメンバーのタスク完了への意欲を高めること」に取り組みます。\n\n目的：このプロジェクトの目的は、自らのリーダーシップおよび計画についての知識を適用し、「プロジェクト計画の策定」「ガイダンス委員会の組織」「チームの協力による計画の実行」を行うことです。\n\n概要：自分の他に3人以上のメンバーからなるチームと協力して完了するプロジェクトを選択します。ガイダンス委員会を組織し、プロジェクト期間中に5回以上のミーティングを行います。クラブ例会で5～7分のスピーチを行い、あなたの計画およびビジョンを紹介します。計画の実行後、クラブ例会で2回目の5～7分のスピーチを行い、計画の策定・完了にまつわる体験を共有します。"},
  {"row": 60, "code": "8509", "level": "Lvl.5", "name_en": "Prepare to Speak Professionally", "name_ja": "プロとしてスピーチを行う", "desc_en": "", "desc_ja": "このプロジェクトでは、「専門分野の決定」「プロフェッショナルなスピーカーの特性の明確化」「聴衆から期待されることについての理解」「聴衆との心の通わせ方」「メッセージを補足・強化するストーリー・逸話の導入」を行う方法について学んでいきます。また、プロレベルのスピーカーとして自分を売り込む方法についても学びます。\n\n目的：このプロジェクトの目的は、長めのスピーチを作成・発表する演習を行うことです。\n\n概要：18～22分の基調スピーチを作成し、発表します。プロレベルのスピーカーとして伝える視点やメッセージを体現します。スピーチとスタイルに合うのであれば、視覚資料を使用することもできます。スピーチは、ユーモアのあるスタイル、情報を提供するスタイルなど、あなたが良いと思い、スピーチ内容に沿っているものであれば、どのような形式でもかまいません。教育担当副会長から事前承認を受けた場合は、Toastmasters 以外のグループに向けてスピーチを行うことができます。"},
  {"row": 61, "code": "8505", "level": "Lvl.5", "name_en": "Leading in Your Volunteer Organization", "name_ja": "ボランティア組織でのリーダーシップの発揮", "desc_en": "", "desc_ja": "このプロジェクトでは、ボランティア組織でリーダーを務める際に必要なスキルを学び、ボランティアを動機づけるには、評価と報奨が重要だという理解を深めます。また、他のメンバーと互いに尊敬しあえる健全な環境を作ることの価値、ならびに誠実さ、コンピテンシー、意思決定における品位、リーダーシップ、行動力の重要性についても学びます。\n\n目的：このプロジェクトの目的は、ボランティアでリーダーシップを効果的に発揮するために必要なスキルを適用することです。\n\n概要：Toastmasters またはその他のボランティア組織において6ヶ月以上リーダーの役割を担います。自分の職場を基にこのプロジェクトを完了することはできますが、ボランティア組織の方が望ましいでしょう。組織のメンバーに、あなたのリーダーシップスキルについての360度評価を行ってもらうよう依頼します。リーダーの役職を退任した後の移行を円滑にするため、後継者育成計画を策定します。6ヶ月の任期後、クラブ例会で5～7分のスピーチを行い、個人体験を振り返ります。"},
  {"row": 62, "code": "8502", "level": "Lvl.5", "name_en": "Ethical Leadership", "name_ja": "倫理的リーダーシップ", "desc_en": "", "desc_ja": "このプロジェクトでは、「倫理的リーダーシップにおける重要要素の特定」「倫理的決定ならびに非倫理的決定による影響についての認識」「倫理的決定を下す際の手順と検討事項の特定」「自分自身の倫理的枠組みの認識・評価」を行います。\n\n目的：このプロジェクトの目的は、自らの倫理的枠組みについて明確な理解を深め、また所属組織やコミュニティの人たちが、倫理について知り、話し合う機会を創出することです。\n\n概要：自らの倫理的枠組みを明確化します。これには、このプロジェクトの内容を超えたところでの個人的なリサーチを行う必要がある場合があります。最後に質疑応答セッションを伴う20～40分の倫理に関するパネルディスカッションを開催し、司会を務めます。パネルディスカッションの進行経験がない場合は、選択プロジェクト「パネルディスカッションの司会」を読んで備えてください。"},
  {"row": 63, "code": "8506", "level": "Lvl.5", "name_en": "Lessons Learned", "name_ja": "学んだこと", "desc_en": "", "desc_ja": "このプロジェクトでは、「大きなグループミーティングの論点の特定」「貢献と意見表明を尊重する文化の促進」「結果をもたらす生産的なディスカッションの進行」を学んでいきます。また、ミーティングで提案された解決策に基づいて今後の改善を計画することについても学びます。\n\n目的：このプロジェクトの目的は、プロジェクト進行中またはプロジェクト完了後に学んだ教訓についてミーティングを運営するために必要なスキルについて学び、それを適用することです。\n\n概要：プロジェクトに共に取り組んでいるチーム、またはプロジェクトを共に完了したチームに対し、学んだ教訓に関するミーティングを進めます。このミーティングは、Toastmasters の定期例会とは異なるものです。ディスカッションを実施・進行します。あなたやチームメンバーが現在実施中、あるいは将来実施するプロジェクトの進行に活用できるよう、文書に結果を記録します。チームリーダーとしてのあなたに関する360度評価を行う機会をまだチームメンバーに提供していない場合は、行ってください（16ページの「360度評価」リソースを使用します）。学んだ教訓に関するミーティングまたはあなたのリーダーシップ体験にまつわる5～7分のスピーチをクラブで行います。"},
  {"row": 64, "code": "8508", "level": "Lvl.5", "name_en": "Moderate a Panel Discussion", "name_ja": "パネルディスカッションの司会", "desc_en": "", "desc_ja": "このプロジェクトでは、「効果的な司会のテクニック」「パネルディスカッションの開催方法」「司会者自身とパネリストの準備の仕方」について学んでいきます。また、「パネルメンバーとして期待されること」「パネルでの話・応答における適切なマナー」「聴衆、司会者自身、その他のパネルメンバーに最高の体験を提供するためのツール」についての知識を深めます。さらには、「パネル中に変更点があった場合の調整方法」「学習や交流のための快適な環境を作る方法」についても学びます。\n\n目的：このプロジェクトの目的は、パブリックスピーカーおよびリーダーとしてのスキルを適用してパネルディスカッションを進行することです。\n\n概要：20～40分のパネルディスカッションの計画・司会を行います。パネルディスカッションのトピックは自由で、クラブ例会あるいは教育担当副会長の承認があればToastmasters の外部で開催することができます。パネリストとして参加する トーストマスターズ会員は、Toastmasters Pathways の単位を取得することはできません。機会があれば、このプロジェクトを完了する別の会員のためにパネリストのボランティアを行ってください。"},
  {"row": 65, "code": "8510", "level": "", "name_en": "Reflect on Your Path (After completing L1-5)", "name_ja": "自分の軌跡を振り返る (L1-5完了後に行う）", "desc_en": "", "desc_ja": "このプロジェクトでは、「コースを通じて得たあなた独自の経験を振り返り、それを説明すること」「学習が Toastmasters 以外の生活にどのような影響を与えたかを共有すること」を学んでいきます。\n\n目的：このプロジェクトの目的は、全コース完了過程での自分の成長を振り返ることです。\n\n概要：クラブ例会で10～12分のスピーチを発表し、コースを完了する体験について共有します。これを、自分が達成してきた結果を振り返り、学習・開発したスキルをまとめ、達成を祝う機会として活用してください。スピーチは、ユーモアのあるスタイル、情報を提供するスタイルなど、あなたが良いと思い、スピーチ内容に沿っているものであれば、どのような形式でもかまいません。"},
  {"row": 66, "code": "8311", "level": "PWMENTORPGM", "name_en": "Pathways Mentor Program Project 1/3", "name_ja": "メンタリングの準備", "desc_en": "", "desc_ja": "このプロジェクトでは、メンターとしての個人目標を策定し、メンタリングの際に必要なスキルや専門知識を認識し、自分の強みと専門分野を特定していきます。また、あなた自身とプロテジェがそれぞれの期待と境界線を明確に設定する重要性を学び、あなたがメンタリングをする各プロテジェと関わるうえで、最適な動機付けのツールが何かを特定します。\n\n目的：このプロジェクトの目的は、「あなたの目標」「メンターになることについてのあなたの興味」「プロテジェと活動を始めるにあたってのあなたの準備状態」について知るために時間を使うことです。\n\n概要：このプロジェクトに含まれている自己評価リソースを完成させます。準備ができたら、Toastmasters のメンターになることについて、教育担当副会長と話し合います。このプロジェクトに含まれているすべてのフォームへの記入を完了したことを確認するため、15ページの「プロジェクト完了記録」を教育担当副会長に提出します。\n\nこのプロジェクトには13ページの「メンターの自己評価」が含まれています。「メンターの自己評価」では、一連の質問に答えることによって、自分自身について、またあなたの持つ特定のスキルや過去の経験をどのようにメンタリングのパートナーシップの成功に貢献させることができるか、詳しくわかるようになっています。"},
  {"row": 67, "code": "8410", "level": "PWMENTORPGM", "name_en": "Mentoring (After Project 8311)", "name_ja": "メンタリング", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、短期のメンタリング課題にメンタリングスキルを適用することです。\n\n概要：プロテジェと共にプロジェクトの完了に取り組みます。教育担当副会長が、メンターと共に1つのプロジェクトに取り組むことに関心がある仲間のトーストマスターを見つける手伝いをします。プロテジェが目標を設定し、プロジェクトを完了するまでの計画を作成するサポートをします。このプロジェクトに含まれているフォームを使用し、「目標設定」「計画」「フィードバックの授受」を行います。メンタリングの終了後、Toastmasters のメンターとしての初めての体験、およびその体験から学んだことについての5～7分のスピーチを例会で行います。"},
  {"row": 68, "code": "8500", "level": "PWMENTORPGM", "name_en": "Advanced Mentoring (After Project 8410)", "name_ja": "アドバンス・メンタリング", "desc_en": "", "desc_ja": "このプロジェクトでは、6ヶ月にわたるメンタリングへの取り組みに関するガイドラインを学んでいきます。また、活用可能なリソース、ならびに長期間にわたって仲間のトーストマスターズ会員にメンタリングを行う過程についても学びます。\n\n目的：このプロジェクトの目的は、メンタリングに長期的に取り組む期間中にメンタリングスキルを適用することです。\n\n概要：6ヶ月間にわたり、仲間の Toastmasters 会員あるいは会員以外の人のためにメンターとしての役割を果たします。プロテジェとコミュニケーションを定期的にとり、ミーティングの日時を記録し、口頭ならびに書面でフィードバックのやり取りを行います。取り組みの終わりに、所属クラブで「メンターとして得たもの」について5～7分のスピーチを行います。このスピーチは、あなたとあなたの体験に関するものです。"},
  {"row": 69, "code": "8599", "level": "DTM", "name_en": "Distinguished Toastmaster", "name_ja": "ディスティングイッシュト トーストマスター", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、リーダーおよびパブリックスピーカーとしてのスキルを示すことです。\n\n概要：組織に有益となるプロジェクトを計画し、完了させます。プロジェクトの完了に役立つ情報を含む以前の「Toastmasters Pathways」プロジェクトがあれば見直してください。チームを作り、計画を立てます。クラブ例会で5～7分のスピーチを行い、計画を共有します。プロジェクトを立ち上げ、チームを率いて完了します。あなたのリーダーシップスキルに対して360度の評価をしてもらうようチーム、組織、同僚にお願いします。クラブ例会で8～10分のスピーチを行い、プロジェクト全般、ならびにプロジェクトの結果・利益、学んだ点について振り返ります。\n\nこのプロジェクトには、トーストマスターズクラブで行う2つのフォーマルスピーチが含まれます。あなたの目標達成に向けてチームをリードしていく過程で、さらに多くのフォーマルそしてインフォーマルなプレゼンテーションを行うことになります。"},
  {"row": 70, "code": "8053", "level": "ー", "name_en": "(Generic Evaluation Resource)", "name_ja": "（一般論評フォーム※4）", "desc_en": "", "desc_ja": "目的：このプロジェクトの目的は、リーダーおよびパブリックスピーカーとしてのスキルを示すことです。\n\n概要：組織に有益となるプロジェクトを計画し、完了させます。プロジェクトの完了に役立つ情報を含む以前の「Toastmasters Pathways」プロジェクトがあれば見直してください。チームを作り、計画を立てます。クラブ例会で5～7分のスピーチを行い、計画を共有します。プロジェクトを立ち上げ、チームを率いて完了します。あなたのリーダーシップスキルに対して360度の評価をしてもらうようチーム、組織、同僚にお願いします。クラブ例会で8～10分のスピーチを行い、プロジェクト全般、ならびにプロジェクトの結果・利益、学んだ点について振り返ります。\n\nこのプロジェクトには、トーストマスターズクラブで行う2つのフォーマルスピーチが含まれます。あなたの目標達成に向けてチームをリードしていく過程で、さらに多くのフォーマルそしてインフォーマルなプレゼンテーションを行うことになります。"}
];
