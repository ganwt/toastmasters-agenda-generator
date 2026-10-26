// main.js の applyPlan を、最小限の偽スプレッドシートで確認する（Google の API は呼ばない）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, readFixture } = require('./gas');

const gas = loadGas();

function fakeSheet(name) {
  const values = {};
  const hiddenRows = [];
  const inserted = [];
  const sheet = {
    name, values, hiddenRows, inserted, hidden: false,
    getRange: (a1OrRow) => {
      if (typeof a1OrRow === 'number') return { copyTo: () => {} };
      return { setValue: (v) => { values[a1OrRow] = v; } };
    },
    hideSheet: () => { sheet.hidden = true; },
    hideRows: (r) => hiddenRows.push(r),
    insertRowsAfter: (after, n) => inserted.push([after, n]),
    deleted: { rows: null, cols: null },
    getMaxColumns: () => 16,
    getMaxRows: () => 1000,
    deleteRows: (from, n) => { sheet.deleted.rows = [from, n]; },
    deleteColumns: (from, n) => { sheet.deleted.cols = [from, n]; },
    getRowHeight: () => 20,
    setRowHeight: () => {}
  };
  return sheet;
}

function fakeSpreadsheet() {
  const sheets = { JE: fakeSheet('JE'), EJ: fakeSheet('EJ'), 'プロジェクト目標': fakeSheet('プロジェクト目標'), '設定': fakeSheet('設定') };
  return {
    sheets,
    getSheetByName: (n) => sheets[n] || null,
    deleteSheet: (s) => { delete sheets[s.name]; }
  };
}

test('applyPlan：384（JE）', () => {
  const m = gas.parseMeeting(readFixture('384_page.html'), readFixture('384_members.html'), 257);
  const plan = gas.buildFillPlan(m, { zoom: 'Z' });
  const ss = fakeSpreadsheet();
  gas.applyPlan(ss, plan);

  const je = ss.sheets.JE;
  assert.equal(je.values.G1, '第384回');
  assert.equal(je.values.J10, '青木 一郎');
  assert.equal(je.values.C22, 8 / 1440);
  assert.equal(je.values.C26, 0);
  assert.equal(ss.sheets.EJ.hidden, true);
  assert.equal(je.hidden, false);
  assert.equal(ss.sheets['設定'], undefined);

  const obj = ss.sheets['プロジェクト目標'];
  assert.equal(obj.values.B3, 'L3: ボーカルバラエティについて');
  assert.equal(obj.values.B5, 'L3: Researching and Presenting');
  assert.deepEqual(obj.hiddenRows, [7, 8, 1]);
  assert.deepEqual(obj.inserted, []);
  // 印刷範囲外の行・列は削除（B:C、8 行目まで残す）
  assert.deepEqual(obj.deleted, { rows: [9, 992], cols: [4, 13] });
});

test('applyPlan：プロジェクトが 4 件なら枠を 1 つ追加', () => {
  const m = gas.parseMeeting(readFixture('385_page.html'), readFixture('385_members.html'), 258);
  m.speeches.ja.push({ ...m.speeches.ja[0], slot: 2, project: '別のプロジェクト', project_row: null });
  const plan = gas.buildFillPlan(m, { zoom: 'Z' });
  const ss = fakeSpreadsheet();
  gas.applyPlan(ss, plan);
  const obj = ss.sheets['プロジェクト目標'];
  assert.deepEqual(obj.inserted, [[8, 2]]);
  assert.equal(obj.values.B9, 'L1: 別のプロジェクト');
  assert.deepEqual(obj.deleted.rows, [11, 990]);
  assert.equal(ss.sheets.JE.hidden, true);
});
