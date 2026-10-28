// main.js の applyPlan を、最小限の偽スプレッドシートで確認する（Google の API は呼ばない）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, readFixture } = require('./gas');

const gas = loadGas();

// セルの値は { 'F25': 値 } で持つ。行の挿入では下の行の値をずらし、copyTo では値を複写する
function fakeSheet(name, initial) {
  let values = { ...(initial || {}) };
  const hiddenRows = [];
  const inserted = [];
  const split = (a1) => { const m = /^([A-Z]+)(\d+)$/.exec(a1); return [m[1], parseInt(m[2], 10)]; };
  const col = (n) => String.fromCharCode(64 + n);
  const sheet = {
    name, hiddenRows, inserted, hidden: false,
    get values() { return values; },
    getRange: (a, b, rows, cols) => {
      if (typeof a === 'number') {
        return {
          row: a, col: b, rows: rows || 1, cols: cols || 1,
          copyTo(dest) {
            for (let r = 0; r < this.rows; r++) {
              for (let c = 0; c < this.cols; c++) {
                const v = values[col(this.col + c) + (this.row + r)];
                if (v !== undefined) values[col(dest.col + c) + (dest.row + r)] = v;
              }
            }
          },
          setFormula: (f) => { values[col(b) + a] = f; },
          setFontFamily: (f) => { sheet.font = f; }
        };
      }
      return { setValue: (v) => { values[a] = v; }, getValue: () => values[a] };
    },
    hideSheet: () => { sheet.hidden = true; },
    hideRows: (r) => hiddenRows.push(r),
    insertRowsAfter: (after, n) => {
      inserted.push([after, n]);
      const next = {};
      for (const [k, v] of Object.entries(values)) {
        const [c, r] = split(k);
        next[c + (r > after ? r + n : r)] = v;
      }
      values = next;
    },
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

// テンプレート（JE）のうち、行の挿入で関係する部分
const JE_TEMPLATE = {
  F25: '準備スピーチ 2', B25: '=B24+C24', B26: '=B25+C25', B27: '=B26+C26', B28: '=B27+C27', B29: '=B28+C28',
  F37: '論評 2', B37: '=B36+C36', B38: '=B37+C37',
  F49: 'Prepared Speech 2', F61: 'Evaluation 2', B62: '=B61+C61', N25: '□'
};

function fakeSpreadsheet() {
  const sheets = { JE: fakeSheet('JE', JE_TEMPLATE), EJ: fakeSheet('EJ'), 'プロジェクト目標': fakeSheet('プロジェクト目標'), '設定': fakeSheet('設定'), 'プロジェクト説明': fakeSheet('プロジェクト説明') };
  return {
    sheets,
    getSheetByName: (n) => sheets[n] || null,
    getSheets: () => Object.values(sheets).map((sh) => ({ ...sh, getName: () => sh.name })),
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
  assert.equal(ss.sheets['プロジェクト説明'], undefined);
  assert.deepEqual(Object.keys(ss.sheets), ['JE', 'EJ', 'プロジェクト目標']);

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

test('applyPlan：前半 3 本（行の挿入）', () => {
  const m = gas.parseMeeting(readFixture('384_page.html'), readFixture('384_members.html'), 257);
  const base = m.speeches.ja[0];
  m.speeches.ja.push({ ...base, slot: 2, speaker: '二' }, { ...base, slot: 3, speaker: '三' });
  const plan = gas.buildFillPlan(m, { zoom: 'Z' });
  const ss = fakeSpreadsheet();
  gas.applyPlan(ss, plan);
  const v = ss.sheets.JE.values;

  assert.deepEqual(ss.sheets.JE.inserted, [[28, 4], [41, 1]]);
  // 見出しの番号を 3 に
  assert.equal(v.F29, '準備スピーチ 3');
  assert.equal(v.F42, '論評 3');
  assert.equal(v.F25, '準備スピーチ 2');
  // B 列の連鎖：挿入した行と次の行
  assert.equal(v.B29, '=B28+C28');
  assert.equal(v.B33, '=B32+C32');
  assert.equal(v.B42, '=B41+C41');
  assert.equal(v.B43, '=B42+C42');
  // 3 本目の記入、ずれた後のセル
  assert.equal(v.J29, '三');
  assert.equal(v.J35, '木村明美');
  // 右側の欄（N 列）は複写しない：N29 は会員欄として上から詰めた値
  assert.equal(v.N29, '□');
  assert.equal(v.O29, 'Alex Smithさん');
});
