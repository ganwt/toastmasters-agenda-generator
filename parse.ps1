<#
.SYNOPSIS
  例会詳細ページ（または TOP ページ）の HTML を解析して meeting.json を出力する。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File parse.ps1 -HtmlPath samples\384_page.html -OutPath cache\meeting.json
#>
param(
    [string]$HtmlPath,
    [string]$OutPath,
    [int]$MtgId = 0
)

$ErrorActionPreference = 'Stop'

function Get-CleanText($s) {
    if ($null -eq $s) { return '' }
    return ([string]$s -replace '\s+', ' ').Trim()
}

function Get-Lines($s) {
    if ($null -eq $s) { return @() }
    return @(([string]$s -split "`r?`n") | ForEach-Object { Get-CleanText $_ } | Where-Object { $_ -ne '' })
}

function ConvertTo-HtmlDocument([string]$Html) {
    $doc = New-Object -ComObject HTMLFile
    try {
        # Office の mshtml PIA がある環境ではこちらが使える
        $doc.IHTMLDocument2_write($Html)
    } catch {
        # PIA が無い環境の定番回避策：UTF-16 バイト列で write する
        $doc.write([Text.Encoding]::Unicode.GetBytes($Html))
    }
    return $doc
}

function Get-ElementsByClass($root, [string]$Tag, [string]$Class) {
    # HTMLFile は旧文書モードで getElementsByClassName が無いことがあるため自前で絞る
    @($root.getElementsByTagName($Tag)) | Where-Object { (" " + $_.className + " ") -like "* $Class *" }
}

function Get-RowCells($row) {
    return @($row.cells)
}

function Find-Table($doc, [scriptblock]$Predicate) {
    foreach ($t in @($doc.getElementsByTagName('table'))) {
        $rows = @($t.rows)
        if ($rows.Count -gt 0 -and (& $Predicate $t $rows)) { return $t }
    }
    return $null
}

function Get-SelectedName($cell) {
    # 担当欄は <select> の選択肢。表示は「山田 太郎さん（ ○ ）」形式なので括弧部分を除く
    foreach ($opt in @($cell.getElementsByTagName('option'))) {
        if ($opt.selected -and $opt.value -ne '-1') {
            return (Get-CleanText ($opt.text -replace '（[^（）]*）\s*$', ''))
        }
    }
    return ''
}

function Remove-San([string]$Name) {
    return ($Name -replace 'さん$', '')
}

$TimeLimitPatterns = @(
    '[（(]?\s*(\d+)\s*分\s*から\s*(\d+)\s*分\s*[）)]?',
    '[（(]?\s*(\d+)\s*min\w*\s*[-~～]\s*(\d+)\s*min\w*\s*[）)]?',
    '[（(]?\s*(\d+)\s*[-~～]\s*(\d+)\s*(分|min\w*)\s*[）)]?'
)

function ConvertFrom-ProjectCell($cell) {
    $result = [ordered]@{ path = ''; level = ''; level_name = ''; project = ''; time_limit = $null }
    $div = Get-ElementsByClass $cell 'div' 'roleDetailStr1' | Select-Object -First 1
    if ($null -eq $div) { return $result }

    # 新しい形式では説明ページへのリンクが付くので、文字列を読む前に取り除く
    foreach ($a in @($div.getElementsByTagName('a'))) { [void]$a.parentNode.removeChild($a) }
    $text = [string]$div.innerText
    foreach ($p in $TimeLimitPatterns) {
        $m = [regex]::Match($text, $p)
        if ($m.Success) {
            $result.time_limit = [ordered]@{ min = [int]$m.Groups[1].Value; max = [int]$m.Groups[2].Value }
            $text = $text.Remove($m.Index, $m.Length)
            break
        }
    }
    $lines = @(Get-Lines $text)
    if ($lines.Count -ge 1) { $result.path = $lines[0] }
    if ($lines.Count -ge 2) {
        if ($lines[1] -match '^(L\d+)\s*(.*)$') {
            $result.level = $Matches[1]
            $result.level_name = $Matches[2]
        } else {
            $result.level_name = $lines[1]
        }
    }
    if ($lines.Count -ge 3) { $result.project = $lines[2] }
    return $result
}

function Get-MeetingInfo($doc) {
    $t = Find-Table $doc { param($t, $rows) $rows.Count -ge 2 -and (Get-RowCells $rows[0]).Count -ge 5 -and (Get-CleanText (Get-RowCells $rows[0])[1].innerText) -like 'Mtg Title*' }
    if ($null -eq $t) { throw '例会基本情報の表が見つかりません' }
    $cells = Get-RowCells @($t.rows)[1]
    $title = Get-CleanText $cells[1].innerText
    $number = 0
    if ($title -match '第(\d+)回') { $number = [int]$Matches[1] }
    return [ordered]@{
        date   = Get-CleanText $cells[0].innerText
        number = $number
        venue  = @(Get-Lines $cells[3].innerText)[-1]
        room   = @(Get-Lines $cells[4].innerText)[-1]
    }
}

function Get-Guests($doc) {
    $t = Find-Table $doc { param($t, $rows) $rows.Count -ge 2 -and (Get-CleanText $rows[0].innerText) -like 'Guests*' }
    if ($null -eq $t) { return @() }
    $rows = @($t.rows)
    $guests = @()
    for ($i = 1; $i -lt $rows.Count; $i++) {
        foreach ($div in (Get-ElementsByClass $rows[$i] 'div' 'nowrap')) {
            $g = Get-CleanText $div.innerText
            if ($g -ne '') { $guests += $g }
        }
    }
    return $guests
}

function Get-RoleRows($doc) {
    $t = @(Get-ElementsByClass $doc 'table' 'mainTbl') | Select-Object -First 1
    if ($null -eq $t) { throw '役割表（mainTbl）が見つかりません' }
    return @(@($t.rows) | Where-Object { [string]$_.id -like 'roleTr_*' })
}

function Get-Attendance($doc) {
    $t = Find-Table $doc { param($t, $rows) $rows.Count -ge 3 -and (Get-CleanText $rows[0].innerText) -like 'Alphabetical Order*' }
    if ($null -eq $t) { return @() }
    $rows = @($t.rows)
    $list = @()
    for ($i = 2; $i -lt $rows.Count; $i++) {
        $cells = Get-RowCells $rows[$i]
        if ($cells.Count -lt 2) { continue }
        $name = Get-CleanText $cells[0].innerText
        # 「アサインなし さん」はシステムの空き枠用ダミー会員
        if ($name -eq '' -or $name -like 'アサインなし*') { continue }
        $list += [ordered]@{ name = $name; mark = Get-CleanText $cells[1].innerText }
    }
    return $list
}

function Get-Upcoming($doc) {
    $t = Find-Table $doc { param($t, $rows) $c = Get-RowCells $rows[0]; $c.Count -eq 2 -and (Get-CleanText $c[0].innerText) -like 'Date*' -and (Get-CleanText $c[1].innerText) -like 'Meeting Title*' }
    if ($null -eq $t) { return @() }
    $rows = @($t.rows)
    $list = @()
    for ($i = 1; $i -lt $rows.Count; $i++) {
        $cells = Get-RowCells $rows[$i]
        if ($cells.Count -lt 2) { continue }
        $number = 0
        if ((Get-CleanText $cells[1].innerText) -match '第(\d+)回') { $number = [int]$Matches[1] }
        $id = 0
        if ($cells[1].innerHTML -match 'showDetail\((\d+)\)') { $id = [int]$Matches[1] }
        $list += [ordered]@{ date = Get-CleanText $cells[0].innerText; number = $number; mtgid = $id }
    }
    return $list
}

function ConvertFrom-MeetingHtml([string]$Html, [int]$MtgId = 0) {
    $doc = ConvertTo-HtmlDocument $Html
    $info = Get-MeetingInfo $doc
    $roleRows = Get-RoleRows $doc

    $roles = [ordered]@{}
    $speechesJa = @()
    $speechesEn = @()
    foreach ($row in $roleRows) {
        $cells = Get-RowCells $row
        $role = Get-CleanText $cells[0].innerText
        $name = Remove-San (Get-SelectedName $cells[1])
        if ($role -match '^(準備スピーチ|Prepared Speech)\s*(\d+)$') {
            if ($name -eq '') { continue }
            $speech = [ordered]@{ slot = [int]$Matches[2]; speaker = $name }
            $prj = ConvertFrom-ProjectCell $cells[4]
            foreach ($k in $prj.Keys) { $speech[$k] = $prj[$k] }
            $speech.title = if ($cells.Count -gt 5) { Get-CleanText $cells[5].innerText } else { '' }
            if ($Matches[1] -eq '準備スピーチ') { $speechesJa += $speech } else { $speechesEn += $speech }
        } else {
            $roles[$role] = $name
        }
    }

    $firstRole = if ($roleRows.Count -gt 0) { Get-CleanText (Get-RowCells $roleRows[0])[0].innerText } else { '' }
    $format = switch ($firstRole) {
        '今夜のトーストマスター' { 'JE' }
        'Toastmaster of the Evening' { 'EJ' }
        default { throw "JE/EJ を判定できません（先頭の役割：$firstRole）" }
    }

    return [ordered]@{
        mtgid      = $MtgId
        date       = $info.date
        number     = $info.number
        venue      = $info.venue
        room       = $info.room
        format     = $format
        guests     = @(Get-Guests $doc)
        roles      = $roles
        speeches   = [ordered]@{ ja = $speechesJa; en = $speechesEn }
        attendance = @(Get-Attendance $doc)
        upcoming   = @(Get-Upcoming $doc)
    }
}

function Read-Utf8File([string]$Path) {
    return [IO.File]::ReadAllText((Resolve-Path $Path).Path, [Text.Encoding]::UTF8)
}

function Write-Utf8File([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

if ($HtmlPath) {
    $meeting = ConvertFrom-MeetingHtml (Read-Utf8File $HtmlPath) $MtgId
    $json = ConvertTo-Json -InputObject $meeting -Depth 6
    if ($OutPath) {
        Write-Utf8File ([IO.Path]::GetFullPath((Join-Path (Get-Location) $OutPath))) $json
    } else {
        $json
    }
}
