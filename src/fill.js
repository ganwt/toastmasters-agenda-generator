// meeting オブジェクト → テンプレートへの記入内容（セル番地と値の一覧）。
// Apps Script の API は使わない純粋な関数。記入ルールは docs/SPEC.md の 4.1・5 章。

var VENUES = {
  '角筈地域センター': { label: '角筈地域センター7F', url: 'https://tsunohazucc.com/tsunohazu_map.html' },
  '四谷地域センター': { label: '四谷地域センター', url: 'http://ycc.tokyo/about.html' }
};

// ヘルパー役の記入順（J13〜J18）。JE / EJ とも同じ順
var HELPER_ROLES = ['計時係', 'えーとカウンター', '笑いカウンター', '文法係', '集計係', '例会報告係'];

var SESSION_ROLES = {
  ja: { tmoe: '今夜のトーストマスター', ttm: 'テーブルトピックスマスター', ge: '総合論評', evals: ['論評1', '論評2'] },
  en: { tmoe: 'Toastmaster of the Evening', ttm: 'Table Topics Master', ge: 'General Evaluation', evals: ['Evaluation1', 'Evaluation2'] }
};

// セッションの位置（前半 / 後半）ごとのセル番地
var SESSION_CELLS = {
  first: {
    speeches: [
      { speaker: 'J21', title: 'F22', project: 'F23', time: 'C22', comment: 'C24' },
      { speaker: 'J25', title: 'F26', project: 'F27', time: 'C26', comment: 'C28' }
    ],
    ttm: 'J31',
    evals: [{ name: 'J36', time: 'C36' }, { name: 'J37', time: 'C37' }],
    ge: 'J38'
  },
  second: {
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
  var set = function (cell, value) { cells.push({ cell: cell, value: value }); };
  var setMinutes = function (cell, minutes) { cells.push({ cell: cell, minutes: minutes }); };
  var role = function (name) { return meeting.roles[name] || ''; };

  var order = meeting.format === 'JE' ? ['ja', 'en'] : ['en', 'ja'];

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
    speeches.forEach(function (s) {
      if (s.slot > c.speeches.length) {
        warnings.push((lang === 'ja' ? '準備スピーチ' : 'Prepared Speech') + s.slot + ' は 3 本目のため未対応です（行の挿入は今後対応）');
      }
    });
    c.speeches.forEach(function (sc, k) {
      var s = speeches.filter(function (x) { return x.slot === k + 1; })[0];
      set(sc.speaker, s ? s.speaker : '');
      set(sc.title, s ? formatSpeechTitle(s, lang) : '');
      set(sc.project, s ? formatProjectLine(s, lang) : '');
      setMinutes(sc.time, s ? (s.time_limit || DEFAULT_TIME_LIMIT).max + SPEECH_MINUTES_EXTRA : 0);
      setMinutes(sc.comment, s ? COMMENT_MINUTES : 0);
      if (s) objectives.push({ speech: s, lang: lang });
    });
    set(c.ttm, role(r.ttm));
    c.evals.forEach(function (ec, k) {
      var name = role(r.evals[k]);
      set(ec.name, name);
      setMinutes(ec.time, name ? EVAL_MINUTES : 0);
    });
    set(c.ge, role(r.ge));
  });

  // 右側の欄：ゲスト
  var guests = (meeting.guests || []).filter(function (g) { return g.indexOf('キャンセル') === -1; });
  var guestCapacity = GUEST_ROWS.last - GUEST_ROWS.first + 1;
  if (guests.length > guestCapacity) warnings.push('ゲストが ' + guests.length + ' 人で欄（' + guestCapacity + ' 行）に入りきりません');
  fillChecklist(set, GUEST_ROWS, TEMPLATE_CHECKBOX_ROWS.guests, guests);

  // 右側の欄：出席予定会員
  var members = (meeting.attendance || []).filter(function (a) { return isAttending(a.mark); }).map(function (a) { return a.name; });
  var memberCapacity = MEMBER_ROWS.last - MEMBER_ROWS.first + 1;
  if (members.length > memberCapacity) warnings.push('出席予定会員が ' + members.length + ' 人で欄に入りきりません');
  fillChecklist(set, MEMBER_ROWS, TEMPLATE_CHECKBOX_ROWS.members, members);

  // 今後の予定
  var next = (meeting.upcoming || []).filter(function (u) { return u.number !== meeting.number; }).slice(0, 2);
  ['H73', 'H74'].forEach(function (cell, k) {
    var u = next[k];
    set(cell, u ? mmdd(u.date) + '　' + weekdayJa(u.date) + '　第' + u.number + '回例会' : '');
  });

  var p = parseDateParts(meeting.date);
  return {
    sheet: meeting.format,
    cells: cells,
    objectives: buildObjectives(objectives, settings, warnings),
    fileName: '新宿BTMC第' + meeting.number + '回例会プログラム' + p.y + pad2(p.m) + pad2(p.d),
    warnings: warnings
  };
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
