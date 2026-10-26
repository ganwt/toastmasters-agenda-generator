# toastmasters-agenda-generator

AI コーディングアシスタント（Claude Code など）向けのプロジェクト説明です。

- 仕様・セル対応表・記入ルール・開発ロードマップは [docs/SPEC.md](docs/SPEC.md) にあります。作業前に必ず読んでください。
- 仕様にない判断が必要になったら、推測で決めずに利用者に確認してください。

## 実装の約束事

- 本体は **Google Apps Script（V8 ランタイム）**。Google スプレッドシート上で動き、利用者の OS を問わない。
- `src/*.js` は Apps Script にそのまま貼れる形で書く。`require` / `import` / `module.exports` は使わず、全ファイル共通のグローバル関数で書く（Apps Script と同じ）。外部ライブラリは使わない。
- Apps Script の API（`SpreadsheetApp`、`UrlFetchApp` など）を呼ぶ部分は薄くし、HTML 解析や記入内容の組み立ては純粋な関数にして Node でテストできるようにする。
- テストは Node 標準の `node:test`（依存パッケージなし）。`tests/gas.js` が `src/` を Apps Script と同じ共通スコープで読み込む。変更後は `npm test` を実行する。
- Apps Script に貼るファイルは `npm run build` で `dist/Code.gs` に生成する。利用者が GitHub から直接取れるようにリポジトリに含めるので、`src/` を変えたらコミット前に必ず `npm run build` する。
- テンプレートの B 列（開始時刻の数式）は変更しない。テンプレート本体は直接書き換えず、毎回コピーしてから記入する。

## 個人情報

- 実際の例会ページ・出欠・会員名などの実データをリポジトリに入れない。`samples/`、`cache/`、`output/`、`logs/`、`config/zoom.txt` は `.gitignore` 済み。
- テスト用 HTML（`tests/fixtures/`）は実ページの氏名を架空の名前に置き換えたもの。新しいフィクスチャを追加するときも同様に匿名化する。
