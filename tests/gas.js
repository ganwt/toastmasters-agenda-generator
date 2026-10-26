// src/ のファイルを Apps Script と同じく「全ファイル共通のグローバル空間」で読み込む
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadGas() {
  const ctx = vm.createContext({ console });
  const dir = path.join(ROOT, 'src');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function readFixture(name) {
  return fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', name), 'utf8');
}

module.exports = { loadGas, readFixture };
