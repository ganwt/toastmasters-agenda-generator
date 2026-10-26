// src/*.js を 1 つにまとめて dist/Code.gs を作る（Apps Script のエディタに貼り付ける用）
// 実行：npm run build
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const files = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const body = files.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(src, f), 'utf8').trim() + '\n').join('\n');
const header = '// toastmasters-agenda-generator（https://github.com/ganwt/toastmasters-agenda-generator）\n' +
  '// このファイルは npm run build で src/ から生成したものです。直接編集しないでください。\n\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'Code.gs'), header + body);
console.log('dist/Code.gs: ' + files.join(', '));
