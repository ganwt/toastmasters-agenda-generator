# toastmasters-agenda-generator

[English](README.en.md)

クラブサポートシステム（tmcsupport.coresv.com）の例会詳細ページから、トーストマスターズの**例会プログラム（Excel / PDF）を自動で作る** Windows 用ツールです。新宿バイリンガルトーストマスターズクラブのテンプレートに合わせて作っています。

これまで手作業で行っていた「システムの画面を見ながら役割を Excel に書き写して PDF にする」作業を、ダブルクリック 1 回で済ませることを目指しています。

> [!WARNING]
> **現在開発中です。まだ例会プログラムは作れません。**
> いま動くのは、例会ページの内容を読み取る部分（`parse.ps1`）だけです。Excel への記入・PDF 出力・`run.bat` はこれから作ります。進み具合は下の「開発状況」を見てください。

## できるようになること（完成時）

- 次回の例会を自動で判定し、クラブサポートシステムから役割・スピーチ・ゲスト・出欠を読み取る
- テンプレートに記入して、Excel ファイルと PDF を `output` フォルダに保存する
  - JE（日本語セッションが先）/ EJ（英語セッションが先）の自動判定
  - スピーチが 3 本の回は行を自動で追加
  - 「プロジェクト目標」ページに Pathways プロジェクトの説明文を記入
- Windows のタスクスケジューラで隔週自動実行することもできる

## 必要なもの

- Windows 10 または 11
- Microsoft Excel（デスクトップ版）
- Google Chrome

ほかに何かをインストールする必要はありません（Windows に最初から入っている PowerShell で動きます）。

## 準備

### 1. ダウンロード

このページ右上の緑色の **Code** ボタン → **Download ZIP** でダウンロードし、好きな場所に展開してください（例：`ドキュメント\toastmasters-agenda-generator`）。

git を使える方は：

```
git clone https://github.com/ganwt/toastmasters-agenda-generator.git
```

### 2. Zoom 情報の設定

Zoom の URL とパスコードは公開できないため、このリポジトリには含めていません。

1. `config` フォルダの `zoom.example.txt` をコピーし、名前を `zoom.txt` に変える
2. `zoom.txt` をメモ帳で開き、クラブの Zoom 情報（URL・ID・パスコード）に書き換えて保存する

ここに書いた内容が、プログラムの「場所」欄にそのまま入ります。クラブの Zoom 情報は役員にお問い合わせください。

### 3. ZIP でダウンロードした場合のブロック解除

ダウンロードした ZIP は、展開する**前**に右クリック →「プロパティ」→ 下のほうの「許可する」にチェック →「OK」としてください。これをしないと、実行時に Windows のセキュリティ警告が出ることがあります。

## 使い方

### 完成後（予定）

`run.bat` をダブルクリックするだけです。終わると `output` フォルダに次のファイルができます。

- `新宿BTMC第386回例会プログラム20261105.pdf`（印刷・配布用）
- `新宿BTMC第386回例会プログラム20261105.xlsx`（手直し用）

### 現在できること：例会ページの読み取り

例会詳細ページを Chrome で「名前を付けて保存（HTML のみ）」したファイルを読み取り、内容を JSON で出力します。

```
powershell -ExecutionPolicy Bypass -File parse.ps1 -HtmlPath 保存したページ.html -OutPath cache\meeting.json
```

## 開発状況

| 段階 | 内容 | 状況 |
|---|---|---|
| 0 | テンプレートの調査（セル対応表・印刷範囲） | ✅ 完了 |
| 1 | 例会ページの読み取り（`parse.ps1`）とテスト | ✅ 完了 |
| 2 | Excel への記入と PDF 出力（`fill.ps1`） | ⬜ 未着手 |
| 3 | スピーチ 3 本の回の行追加 | ⬜ 未着手 |
| 4 | Pathways プロジェクト説明の一覧（`config/projects.json`） | ⬜ 未着手 |
| 5 | ページの自動取得（`fetch.ps1`）、`run.bat`、定期実行の設定 | ⬜ 未着手 |

## フォルダ構成

```
parse.ps1             例会ページの HTML を読み取る
template.xlsx         プログラムのテンプレート（直接編集しない）
config/               設定（zoom.txt は各自で作成）
docs/SPEC.md          詳しい仕様（記入ルール・セル対応表など）
tests/                テスト（tests/fixtures の HTML は氏名を架空のものに置換済み）
```

実行時に `cache/`（取得したページ）、`output/`（完成品）、`logs/`（ログ）が作られます。これらには会員の氏名が含まれるため、リポジトリには入れないでください（`.gitignore` 済み）。

## 開発者向け

- 詳しい仕様は [docs/SPEC.md](docs/SPEC.md) にあります。AI コーディングアシスタント向けの指示は [CLAUDE.md](CLAUDE.md) です。
- テストの実行（Windows 標準の Pester 3.4 を使用）：

  ```
  powershell -ExecutionPolicy Bypass -Command "Invoke-Pester tests"
  ```

- `.ps1` ファイルは必ず **UTF-8（BOM 付き）** で保存してください。BOM が無いと PowerShell 5.1 で日本語が文字化けします。
- テストに実際の例会ページを使うときは、氏名を架空のものに置き換えてから `tests/fixtures/` に入れてください。

## 注意事項

- 本ツールはクラブ会員が個人的に作成した非公式のツールです。Toastmasters International およびクラブサポートシステムの提供者とは関係ありません。
- クラブサポートシステムへのアクセスは、1 回の実行につき 2 ページだけです。

## ライセンス

[MIT License](LICENSE)
