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

// 例会ページのスピーチ → プロジェクト説明（parseProjectSheet の結果）の該当プロジェクト。
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

// クラブ用スプレッドシートの「プロジェクト説明」シート（tools/build_projects.py の CSV を取り込んだもの）を読む。
// values は getDataRange().getValues() の形。列は 1 行目の見出しで探す
var PROJECT_SHEET_COLUMNS = ['row', 'code', 'level', 'name_en', 'name_ja', 'desc_ja', 'desc_en'];

function parseProjectSheet(values) {
  if (!values || !values.length) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  PROJECT_SHEET_COLUMNS.forEach(function (k) { col[k] = header.indexOf(k); });
  var get = function (r, k) { return col[k] < 0 ? '' : String(r[col[k]] === undefined ? '' : r[col[k]]).trim(); };
  return values.slice(1).filter(function (r) { return /^\d{4}$/.test(get(r, 'code')); }).map(function (r) {
    var p = {};
    PROJECT_SHEET_COLUMNS.forEach(function (k) { p[k] = get(r, k); });
    p.row = parseInt(p.row, 10) || 0;
    return p;
  });
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
var PROJECTS_SHEET = 'プロジェクト説明'; // tools/build_projects.py の CSV を取り込んだシート（クラブ内のみ）
var OBJECTIVES_SHEET = 'プロジェクト目標';
var PROGRAM_SHEETS = ['JE', 'EJ', OBJECTIVES_SHEET];

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
  // プログラムのシート以外（設定・プロジェクト説明など）はコピーには不要。残すと PDF に出てしまう
  ss.getSheets().forEach(function (sh) {
    if (PROGRAM_SHEETS.indexOf(sh.getName()) === -1) ss.deleteSheet(sh);
  });

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
  var projectSheet = ss.getSheetByName(PROJECTS_SHEET);
  var projects = projectSheet ? parseProjectSheet(projectSheet.getDataRange().getValues()) : [];
  var plan = buildFillPlan(meeting, { zoom: settings.zoom, findProject: function (s) { return findProjectInfo(s, projects); } });
  if (!projects.length) plan.warnings.unshift('「' + PROJECTS_SHEET + '」シートにデータが無いため、プロジェクトの説明は入りません');

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
