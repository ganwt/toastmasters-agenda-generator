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
