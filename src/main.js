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

// ① プログラム作成：クラブ用スプレッドシート（テンプレート）のコピーを出力フォルダに作って記入する
function createProgram(mtgid) {
  return createProgramFromMeeting(fetchMeeting(mtgid));
}

function createProgramFromMeeting(meeting) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = readSettings(ss);
  var folder = folderFromUrl(settings.folderUrl);
  var plan = buildFillPlan(meeting, { zoom: settings.zoom, findProject: function (s) { return findProjectInfo(s, PROJECTS); } });

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

function onOpen() {
  SpreadsheetApp.getUi().createMenu('例会プログラム')
    .addItem('① プログラム作成（mtgid を指定）', 'menuCreateProgramById')
    .addItem('② PDF 出力', 'menuExportPdf')
    .addToUi();
}

function showLink(title, message, url) {
  var html = '<p style="font-family:sans-serif">' + message + '</p>' +
    '<p style="font-family:sans-serif"><a href="' + url + '" target="_blank">開く</a></p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(200), title);
}

function warningText(warnings) {
  return warnings.length ? '<br><br>注意：<br>' + warnings.map(function (w) { return '・' + w; }).join('<br>') : '';
}

function menuCreateProgramById() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('プログラム作成', '例会の mtgid（例会詳細ページの URL の mtgid= の数字）を入力してください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var mtgid = parseInt(res.getResponseText(), 10);
  if (!mtgid) { ui.alert('mtgid は数字で入力してください'); return; }
  var r = createProgram(mtgid);
  showLink('作成しました', '第' + r.number + '回のプログラムを作成しました。開いて内容を確認し、必要なら手直ししてから「② PDF 出力」を実行してください。' + warningText(r.warnings), r.url);
}

function menuExportPdf() {
  var r = exportProgramPdf();
  showLink('PDF を保存しました', 'PDF を保存しました。', r.url);
}

// 段階 4 の動作確認用：第 384 回のデータを元に、両セッションともスピーチ 3 本にした人工データで作成する
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
