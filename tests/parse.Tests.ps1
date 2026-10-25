# Pester 3.4（Windows 標準搭載）用。実行：powershell -ExecutionPolicy Bypass -Command "Invoke-Pester tests"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'parse.ps1')

function Get-Sample([string]$Name) {
    Read-Utf8File (Join-Path $root "tests\fixtures\$Name")
}

Describe '384（JE・会後）' {
    $m = ConvertFrom-MeetingHtml (Get-Sample '384_page.html') 257

    It '基本情報' {
        $m.mtgid | Should Be 257
        $m.date | Should Be '2026/10/01'
        $m.number | Should Be 384
        $m.venue | Should Be '四谷地域センター'
        $m.room | Should Be '集会室３'
        $m.format | Should Be 'JE'
    }
    It 'ゲスト' {
        @($m.guests).Count | Should Be 1
        $m.guests[0] | Should Be '林さん（Area Director）'
    }
    It '役割：括弧とさんを除き、名前の空白は保持' {
        $m.roles['今夜のトーストマスター'] | Should Be '青木 一郎'
        $m.roles['Toastmaster of the Evening'] | Should Be '久保さくら'
        $m.roles['えーとカウンター'] | Should Be '小川 三郎'
        $m.roles['論評1'] | Should Be '小川 三郎'
        $m.roles['General Evaluation'] | Should Be 'Alex Smith'
        $m.roles['論評2'] | Should Be ''
    }
    It 'ゲストが役割に入っている場合（括弧なし）' {
        $m.roles['テーブルトピックス回答者2'] | Should Be '林'
    }
    It '日本語スピーチ' {
        @($m.speeches.ja).Count | Should Be 1
        $s = $m.speeches.ja[0]
        $s.slot | Should Be 1
        $s.speaker | Should Be '久保さくら'
        $s.path | Should Be 'プレゼンテーション熟達'
        $s.level | Should Be 'L3'
        $s.level_name | Should Be '知識を増やす'
        $s.project | Should Be 'ボーカルバラエティについて'
        $s.title | Should Be '部長の話が聞こえない'
        $s.time_limit | Should BeNullOrEmpty
    }
    It '英語スピーチ' {
        @($m.speeches.en).Count | Should Be 1
        $s = $m.speeches.en[0]
        $s.speaker | Should Be '小林拓也'
        $s.path | Should Be 'Motivational Strategies'
        $s.project | Should Be 'Researching and Presenting'
        $s.title | Should Be 'Power of a 100-year vision'
    }
    It '出欠表（ダミー会員を除く）' {
        @($m.attendance).Count | Should Be 19
        $m.attendance[0].name | Should Be '江口次郎さん'
        $m.attendance[0].mark | Should Be '○'
        ($m.attendance | Where-Object { $_.name -eq '久保さくらさん' }).mark | Should Be '◎日本語'
        @($m.attendance | Where-Object { $_.name -like 'アサインなし*' }).Count | Should Be 0
    }
    It 'Upcoming' {
        @($m.upcoming).Count | Should Be 5
        $m.upcoming[0].date | Should Be '2026/11/05'
        $m.upcoming[0].number | Should Be 386
        $m.upcoming[0].mtgid | Should Be 259
    }
}

Describe '385（EJ・会後）' {
    $m = ConvertFrom-MeetingHtml (Get-Sample '385_page.html')

    It '基本情報' {
        $m.format | Should Be 'EJ'
        $m.number | Should Be 385
        $m.venue | Should Be '角筈地域センター'
        $m.room | Should Be '会議室A'
    }
    It 'キャンセルのゲストも解析結果には残す（除外は fill 側）' {
        @($m.guests).Count | Should Be 2
        $m.guests[0] | Should Be '山本ジョン太郎さん（キャンセル）'
    }
    It '英語スピーチ 2 本' {
        @($m.speeches.en).Count | Should Be 2
        $m.speeches.en[1].slot | Should Be 2
        $m.speeches.en[1].speaker | Should Be '上野健太'
        $m.speeches.en[1].path | Should Be 'Engaging Humor'
        $m.speeches.en[1].project | Should Be 'Using Descriptive Language'
    }
    It '日本語スピーチ' {
        $s = $m.speeches.ja[0]
        $s.speaker | Should Be '加藤 四郎'
        $s.path | Should Be '革新的な企画立案'
        $s.level | Should Be 'L1'
        $s.project | Should Be 'リサーチとプレゼンテーション'
        $s.title | Should Be '私たちは、自滅危惧種なのだろうか？'
    }
    It 'EJ でも helper は日本語の役割名で取れる' {
        $m.roles['計時係'] | Should Be '小林拓也'
        $m.roles['Evaluation2'] | Should Be '久保さくら'
    }
}

Describe '386（JE・会前）' {
    $m = ConvertFrom-MeetingHtml (Get-Sample '386_page.html')

    It '役割が空でもエラーにならない' {
        $m.format | Should Be 'JE'
        $m.roles['今夜のトーストマスター'] | Should Be ''
        @($m.speeches.ja).Count | Should Be 0
        @($m.speeches.en).Count | Should Be 0
    }
    It 'ゲストと出欠' {
        $m.guests[0] | Should Be '森さん（元新宿会員）'
        ($m.attendance | Where-Object { $_.name -eq '上野健太さん' }).mark | Should Be '△'
        ($m.attendance | Where-Object { $_.name -eq '青木 一郎さん' }).mark | Should Be ''
    }
    It 'Upcoming には当期自身も含まれる' {
        $m.upcoming[0].number | Should Be 386
    }
}

Describe '時限とリンク付きの項目欄（人工データ）' {
    $html = Get-Sample '384_page.html'
    $ja = 'ボーカルバラエティについて</div>'
    $en = 'Researching and Presenting</div>'

    It '元データに置換対象がちょうど 1 か所ある' {
        ([regex]::Matches($html, [regex]::Escape($ja))).Count | Should Be 1
        ([regex]::Matches($html, [regex]::Escape($en))).Count | Should Be 1
    }
    It '日本語：（4分から6分）とリンクを項目名から分離' {
        $h = $html.Replace($ja, 'ボーカルバラエティについて<br>（4分から6分）<br><a href="https://example.com/p" target="_blank">プロジェクト説明</a></div>')
        $s = (ConvertFrom-MeetingHtml $h).speeches.ja[0]
        $s.project | Should Be 'ボーカルバラエティについて'
        $s.time_limit.min | Should Be 4
        $s.time_limit.max | Should Be 6
    }
    It '時限が項目名と同じ行に付いていても分離' {
        $h = $html.Replace($ja, 'ボーカルバラエティについて（4分から6分）<a href="https://example.com/p">link</a></div>')
        $s = (ConvertFrom-MeetingHtml $h).speeches.ja[0]
        $s.project | Should Be 'ボーカルバラエティについて'
        $s.time_limit.max | Should Be 6
    }
    It '英語：(4min - 6min) 形式' {
        $h = $html.Replace($en, 'Researching and Presenting<br>(4min - 6min)<br><a href="https://example.com/p">Project</a></div>')
        $s = (ConvertFrom-MeetingHtml $h).speeches.en[0]
        $s.project | Should Be 'Researching and Presenting'
        $s.time_limit.min | Should Be 4
        $s.time_limit.max | Should Be 6
    }
}
