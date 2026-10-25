# toastmasters-agenda-generator

AI コーディングアシスタント（Claude Code など）向けのプロジェクト説明です。

- 仕様・セル対応表・記入ルール・開発ロードマップは [docs/SPEC.md](docs/SPEC.md) にあります。作業前に必ず読んでください。
- 仕様にない判断が必要になったら、推測で決めずに利用者に確認してください。

## 実装の約束事

- 実行環境は Windows 10/11 標準の **PowerShell 5.1** のみ。利用者に追加インストールを求めない（Excel と Chrome は前提）。
- `.ps1` ファイルは **UTF-8（BOM 付き）** で保存する。BOM が無いと PowerShell 5.1 が日本語を読み違える。
- HTML 解析は HTMLFile COM、Excel 操作は Excel COM、テストは Windows 標準の Pester 3.4。
- `template.xlsx` は直接編集しない。毎回コピーしてから記入する。B 列（開始時刻の数式）は変更しない。
- 変更後は `powershell -ExecutionPolicy Bypass -Command "Invoke-Pester tests"` を実行する。

## 個人情報

- 実際の例会ページ・出欠・会員名などの実データをリポジトリに入れない。`samples/`、`cache/`、`output/`、`logs/`、`config/zoom.txt` は `.gitignore` 済み。
- テスト用 HTML（`tests/fixtures/`）は実ページの氏名を架空の名前に置き換えたもの。新しいフィクスチャを追加するときも同様に匿名化する。
