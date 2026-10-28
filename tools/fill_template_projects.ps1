<#
.SYNOPSIS
  template.xlsx の「プロジェクト説明」シートに、日本語の説明（公開資料から作ったもの）を書き込む（開発者用・Windows + Excel）。
  英語（desc_en）は会員向け資料なので書き込まない（空のまま）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fill_template_projects.ps1
  （先に tools/build_projects.py で cache\pathways\project_descriptions.csv を作っておく）
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$csvPath = Join-Path $root 'cache\pathways\project_descriptions.csv'
$xlsxPath = Join-Path $root 'template.xlsx'
$columns = @('row', 'code', 'level', 'name_en', 'name_ja', 'desc_ja', 'desc_en')

$rows = @(Import-Csv -Path $csvPath -Encoding UTF8)
# Excel には 2 次元配列でまとめて書き込む（1 行目は見出し）
$data = New-Object 'object[,]' ($rows.Count + 1), $columns.Count
for ($c = 0; $c -lt $columns.Count; $c++) { $data[0, $c] = $columns[$c] }
for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 0; $c -lt $columns.Count; $c++) {
        $name = $columns[$c]
        $data[($r + 1), $c] = if ($name -eq 'desc_en') { '' } else { [string]$rows[$r].$name }
    }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($xlsxPath)
    $sheet = $wb.Worksheets.Item('プロジェクト説明')
    $sheet.Cells.Clear() | Out-Null
    $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item($rows.Count + 1, $columns.Count)).Value2 = $data
    $sheet.Range('A1:G1').Font.Bold = $true
    $wb.Worksheets.Item('JE').Activate()
    $wb.RemovePersonalInformation = $true
    $wb.Save()
    $wb.Close($false)
} finally {
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
"template.xlsx の「プロジェクト説明」に $($rows.Count) 件を書き込みました（日本語のみ）"
