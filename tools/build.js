// src/*.js を 1 つにまとめて dist/Code.gs を作る（Apps Script のエディタに貼り付ける用）
// 実行：npm run build
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const files = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const body = files.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(src, f), 'utf8').trim() + '\n').join('\n');
// 更新履歴（新しい版は末尾に追加する。Code.gs の先頭のコメントに出す。手順書・テンプレートの版と同じ番号）
const HISTORY = [
  ['v1.00', '2026-11-02', '初版'],
  ['v1.01', '2026-11-07', 'イベントの挿入（「イベント」シート）、終了予定が 21:15 を過ぎるときのテーブルトピック自動調整、' +
    '番号の無い役割名（準備スピーチ・論評）の読み取りを修正、作成後の画面を大きく'],
  ['v1.02', '2026-11-08', 'イベントの挿入位置に「会長挨拶・ゲスト紹介の後」を追加、' +
    '終了予定の調整をテーブルトピック → 休憩 → 総合論評 → テーブルトピックの順に変更'],
  ['v1.03', '2026-11-08', '終了予定の自動調整でテーブルトピックを各セッション 2 人より減らさないように変更（それ以上は TMOE が判断して手直し）']
];
const latest = HISTORY[HISTORY.length - 1];
const header = '// toastmasters-agenda-generator（https://github.com/ganwt/toastmasters-agenda-generator）\n' +
  `// 版：${latest[0]}（${latest[1]}）\n` +
  '// このファイルは npm run build で src/ から生成したものです。直接編集しないでください。\n' +
  '//\n// 更新履歴\n' +
  HISTORY.map(([v, d, text]) => `//   ${v}  ${d}  ${text}`).join('\n') + '\n\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'Code.gs'), header + body);
console.log('dist/Code.gs: ' + files.join(', '));
