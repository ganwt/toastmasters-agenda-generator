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
