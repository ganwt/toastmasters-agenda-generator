const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, readFixture } = require('./gas');

const gas = loadGas();
const ZOOM = 'https://zoom.example/j/1\r\nID: 000\r\nパスコード: XXXX';

function meeting(n, mtgid) {
  return gas.parseMeeting(readFixture(n + '_page.html'), readFixture(n + '_members.html'), mtgid);
}

// プランのセル一覧を { 'J10': 値 } の形にする（時間は '8分' のような文字列）
function cellMap(plan) {
  const map = {};
  for (const c of plan.cells) map[c.cell] = 'minutes' in c ? c.minutes + '分' : c.value;
  return map;
}

test('384（JE）', async (t) => {
  const m = meeting('384', 257);
  const plan = gas.buildFillPlan(m, { zoom: ZOOM });
  const c = cellMap(plan);

  await t.test('シートとファイル名', () => {
    assert.equal(plan.sheet, 'JE');
    assert.equal(plan.fileName, '新宿BTMC第384回例会プログラム20261001');
  });
  await t.test('ヘッダー（Zoom の改行は LF にそろえる）', () => {
    assert.equal(c.G1, '第384回');
    assert.equal(c.J2, '10/01 19:15～21:15');
    assert.equal(c.J3, 'https://zoom.example/j/1\nID: 000\nパスコード: XXXX\n会場：四谷地域センター 集会室３\nhttp://ycc.tokyo/about.html');
  });
  await t.test('TMOE・今夜の言葉・ヘルパー（さんなし、空白は保持）', () => {
    assert.equal(c.J10, '青木 一郎');
    assert.equal(c.J11, '青木 一郎');
    assert.deepEqual([c.J13, c.J14, c.J15, c.J16, c.J17, c.J18], ['石田花子', '小川 三郎', '加藤 四郎', '江口次郎', '上野健太', '木村明美']);
    assert.equal(c.J43, 'TMOE: 久保さくら');
  });
  await t.test('前半（日本語）スピーチ 1 本：2 本目の枠は 0 分', () => {
    assert.equal(c.J21, '久保さくら');
    assert.equal(c.F22, '『部長の話が聞こえない』（5～7分）');
    assert.equal(c.F23, 'プレゼンテーション熟達 L3：ボーカルバラエティについて');
    assert.equal(c.C22, '8分');
    assert.equal(c.C24, '1分');
    assert.equal(c.J25, '');
    assert.equal(c.F26, '');
    assert.equal(c.C26, '0分');
    assert.equal(c.C28, '0分');
  });
  await t.test('後半（英語）スピーチ', () => {
    assert.equal(c.J45, '小林拓也');
    assert.equal(c.F46, '"Power of a 100-year vision" (5-7 min)');
    assert.equal(c.F47, 'Motivational Strategies L3: Researching and Presenting');
    assert.equal(c.C45, '8分');
    assert.equal(c.C48, '1分');
    assert.equal(c.C49, '0分');
    assert.equal(c.C52, '0分');
  });
  await t.test('論評・TT マスター・総合論評', () => {
    assert.equal(c.J36, '小川 三郎');
    assert.equal(c.C36, '5分');
    assert.equal(c.J37, '');
    assert.equal(c.C37, '0分');
    assert.equal(c.J31, '木村明美');
    assert.equal(c.J38, 'Alex Smith');
    assert.equal(c.J60, '加藤 四郎');
    assert.equal(c.C60, '5分');
    assert.equal(c.J54, '木村明美');
    assert.equal(c.J62, 'Alex Smith');
  });
  await t.test('ゲスト：□ は名前のある行だけ', () => {
    assert.equal(c.O7, '林さん（Area Director）');
    assert.equal(c.N7, '□');
    for (const r of [8, 9, 10, 11, 12]) {
      assert.equal(c['N' + r], '', 'N' + r);
      assert.equal(c['O' + r], '', 'O' + r);
    }
  });
  await t.test('出席予定会員：◎ と ○ のみ、ページ順、さん付き', () => {
    const expected = m.attendance.filter((a) => a.mark === '○' || a.mark.startsWith('◎')).map((a) => a.name);
    assert.equal(expected.length, 11);
    expected.forEach((name, i) => {
      assert.equal(c['O' + (19 + i)], name);
      assert.equal(c['N' + (19 + i)], '□');
    });
    assert.equal(c.O19, '江口次郎さん');
    assert.equal(c.O30, undefined); // テンプレートの □（〜24 行）より下で名前の無い行は触らない
  });
  await t.test('今後の予定：当期を除く 2 件、曜日は日付から計算', () => {
    assert.equal(c.H73, '11/05　木曜日　第386回例会');
    assert.equal(c.H74, '11/19　木曜日　第387回例会');
  });
  await t.test('プロジェクト目標：説明データが無ければ見出しのみ＋警告', () => {
    assert.deepEqual(Array.from(plan.objectives, (o) => o.title), ['L3: ボーカルバラエティについて', 'L3: Researching and Presenting']);
    assert.equal(plan.warnings.filter((w) => w.includes('説明が見つかりません')).length, 2);
  });
});

test('385（EJ）', async (t) => {
  const m = meeting('385', 258);
  const plan = gas.buildFillPlan(m, { zoom: ZOOM });
  const c = cellMap(plan);

  await t.test('前半が英語、後半が日本語', () => {
    assert.equal(plan.sheet, 'EJ');
    assert.equal(c.J10, '王小明');
    assert.equal(c.J43, 'TMOE: 王小明');
    assert.equal(c.J45, '加藤 四郎');
    assert.equal(c.F46, '『私たちは、自滅危惧種なのだろうか？』（5～7分）');
    assert.equal(c.F47, '革新的な企画立案 L1：リサーチとプレゼンテーション');
  });
  await t.test('前半スピーチ 2 本とも時間が入る（手作業版の漏れを繰り返さない）', () => {
    assert.equal(c.J25, '上野健太');
    assert.equal(c.F26, '"Let’s make mistakes!" (5-7 min)');
    assert.equal(c.C26, '8分');
    assert.equal(c.C28, '1分');
  });
  await t.test('論評 2 に担当者がいれば 5 分', () => {
    assert.equal(c.J37, '久保さくら');
    assert.equal(c.C37, '5分');
  });
  await t.test('キャンセルのゲストは載せない', () => {
    assert.equal(c.O7, '');
    assert.equal(c.N7, '');
  });
  await t.test('会場（会議室名はページから）', () => {
    assert.match(c.J3, /会場：角筈地域センター7F 会議室A\nhttps:\/\/tsunohazucc\.com\/tsunohazu_map\.html$/);
  });
  await t.test('プロジェクト目標は登場順', () => {
    assert.deepEqual(Array.from(plan.objectives, (o) => o.title), ['L3: Researching and Presenting', 'L3: Using Descriptive Language', 'L1: リサーチとプレゼンテーション']);
  });
});

test('386（JE・会前、新形式のプロジェクト欄）', () => {
  const plan = gas.buildFillPlan(meeting('386', 259), { zoom: ZOOM });
  const c = cellMap(plan);
  assert.equal(c.J10, '');
  assert.equal(c.J43, '');
  assert.equal(c.F22, '『令和バージョン・おじさんの小言』（5～7分）');
  assert.equal(c.F23, 'Presentation Mastery L2：Introduction to Toastmasters Mentoring');
  assert.equal(c.C22, '8分');
  assert.equal(c.H73, '11/19　木曜日　第387回例会');
  assert.deepEqual(Array.from(plan.objectives, (o) => o.title), ['L2: Introduction to Toastmasters Mentoring']);
});

test('時限 4〜6 分のスピーチ', () => {
  const m = meeting('384');
  m.speeches.ja[0].time_limit = { min: 4, max: 6 };
  m.speeches.en[0].time_limit = { min: 4, max: 6 };
  const c = cellMap(gas.buildFillPlan(m, { zoom: ZOOM }));
  assert.equal(c.F22, '『部長の話が聞こえない』（4～6分）');
  assert.equal(c.C22, '7分');
  assert.equal(c.F46, '"Power of a 100-year vision" (4-6 min)');
  assert.equal(c.C45, '7分');
});

test('プロジェクト説明：言語に応じて desc_ja / desc_en、同じプロジェクトは 1 回だけ', () => {
  const m = meeting('384');
  m.speeches.en.push({ ...m.speeches.en[0], slot: 2, speaker: '誰か' });
  const findProject = (s) => ({ desc_ja: s.project + 'の説明', desc_en: 'About ' + s.project });
  const plan = gas.buildFillPlan(m, { zoom: ZOOM, findProject });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.objectives)), [
    { title: 'L3: ボーカルバラエティについて', description: 'ボーカルバラエティについての説明' },
    { title: 'L3: Researching and Presenting', description: 'About Researching and Presenting' }
  ]);
  assert.equal(plan.warnings.length, 0);
});

test('プロジェクト目標：使わない枠の行は隠す', () => {
  const layout = gas.objectiveLayout([{ title: 'L3: A', description: 'a' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(layout)), {
    cells: [{ cell: 'B3', value: 'L3: A' }, { cell: 'B4', value: 'a' }],
    hideRows: [5, 6, 7, 8],
    extraSlots: 0
  });
});

test('プロジェクト目標：4 件以上は枠を追加', () => {
  const objs = [1, 2, 3, 4].map((i) => ({ title: 'L1: P' + i, description: 'd' + i }));
  const layout = gas.objectiveLayout(objs);
  assert.equal(layout.extraSlots, 1);
  assert.deepEqual(Array.from(layout.hideRows), []);
  assert.deepEqual(JSON.parse(JSON.stringify(layout.cells.slice(-2))), [{ cell: 'B9', value: 'L1: P4' }, { cell: 'B10', value: 'd4' }]);
});

test('警告：Zoom 未設定、未登録の会場', () => {
  const m = meeting('384');
  m.venue = '新しいセンター';
  const plan = gas.buildFillPlan(m, {});
  const c = cellMap(plan);
  assert.equal(c.J3, '会場：新しいセンター 集会室３');
  assert.ok(plan.warnings.some((w) => w.includes('Zoom')));
  assert.ok(plan.warnings.some((w) => w.includes('新しいセンター')));
});

test('スピーチ 2 本以下なら行の挿入なし', () => {
  assert.deepEqual(Array.from(gas.buildFillPlan(meeting('384'), { zoom: ZOOM }).inserts), []);
});

// 384（JE）を元に、前半（日本語）を 3 本にした人工データ
function threeSpeechesFirst() {
  const m = meeting('384');
  const base = m.speeches.ja[0];
  m.speeches.ja.push({ ...base, slot: 2, speaker: 'スピーカー二', title: '二本目' });
  m.speeches.ja.push({ ...base, slot: 3, speaker: 'スピーカー三', title: '三本目', time_limit: { min: 4, max: 6 } });
  return m;
}

test('前半 3 本：スピーチ 2 のブロックの後に 4 行、論評 2 の後に 1 行を挿入', async (t) => {
  const plan = gas.buildFillPlan(threeSpeechesFirst(), { zoom: ZOOM });
  const c = cellMap(plan);

  await t.test('挿入の指示（挿入後の行番号）', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(plan.inserts)), [
      { after: 28, count: 4, from: 25, label: 'F29' },
      { after: 41, count: 1, from: 41, label: 'F42' }
    ]);
  });
  await t.test('3 本目は挿入した行に入る', () => {
    assert.equal(c.J25, 'スピーカー二');
    assert.equal(c.J29, 'スピーカー三');
    assert.equal(c.F30, '『三本目』（4～6分）');
    assert.equal(c.F31, 'プレゼンテーション熟達 L3：ボーカルバラエティについて');
    assert.equal(c.C30, '7分');
    assert.equal(c.C32, '1分');
  });
  await t.test('挿入より下のセルはずれた位置に入る', () => {
    assert.equal(c.J35, '木村明美'); // TT マスター（元 J31）
    assert.equal(c.J40, '小川 三郎'); // 論評 1（元 J36）
    assert.equal(c.J41, ''); // 論評 2（元 J37）
    assert.equal(c.J42, ''); // 論評 3（日本語セッションには役割が無い）
    assert.equal(c.C42, '0分');
    assert.equal(c.J43, 'Alex Smith'); // 総合論評（元 J38）
    assert.equal(c.J48, 'TMOE: 久保さくら'); // 後半 TMOE（元 J43）
    assert.equal(c.J50, '小林拓也'); // 後半スピーチ 1（元 J45）
    assert.equal(c.H78, '11/05　木曜日　第386回例会'); // 今後の予定（元 H73）
    assert.equal(c.H73, undefined);
  });
  await t.test('右側の欄は挿入後のシートで上から詰める（行番号はずらさない）', () => {
    assert.equal(c.O19, '江口次郎さん');
    assert.equal(c.O7, '林さん（Area Director）');
  });
});

test('両セッション 3 本（EJ）：後半の挿入位置は前半の挿入分もずれる', () => {
  const m = meeting('385');
  m.speeches.en.push({ ...m.speeches.en[0], slot: 3, speaker: 'Third' });
  m.speeches.ja.push({ ...m.speeches.ja[0], slot: 2, speaker: '二' }, { ...m.speeches.ja[0], slot: 3, speaker: '三' });
  m.roles.Evaluation3 = 'Eval Three';
  const plan = gas.buildFillPlan(m, { zoom: ZOOM });
  const c = cellMap(plan);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.inserts)), [
    { after: 28, count: 4, from: 25, label: 'F29' },
    { after: 41, count: 1, from: 41, label: 'F42' },
    { after: 57, count: 4, from: 54, label: 'F58' },
    { after: 70, count: 1, from: 70, label: 'F71' }
  ]);
  assert.equal(c.J29, 'Third');
  assert.equal(c.J42, 'Eval Three'); // 論評 3（英語は役割がある）
  assert.equal(c.C42, '5分');
  assert.equal(c.J50, '加藤 四郎'); // 後半スピーチ 1（元 J45）
  assert.equal(c.J54, '二'); // 後半スピーチ 2（元 J49）
  assert.equal(c.J58, '三');
  assert.equal(c.J71, ''); // 後半の論評 3（元 J61 + 9 行 + 1）
  assert.equal(c.H83, '11/05　木曜日　第386回例会'); // 元 H73 + 10 行
});

// 「プロジェクト説明」シートの見本（getDataRange().getValues() の形）。説明文は架空のもの
const PROJECT_SHEET = [
  ['row', 'code', 'level', 'name_en', 'name_ja', 'desc_ja', 'desc_en'],
  [35, '8317', 'Lvl.3', 'Understanding Vocal Variety', 'ボーカルバラエティについて', '（見本）ボーカルバラエティの説明', '(sample) vocal variety purpose'],
  [38, 8321, 'Lvl.3', 'Researching and Presenting', 'リサーチとプレゼンテーション', '（見本）リサーチの説明', ''],
  [11, '8204', 'Lvl.2', 'Introduction to Toastmasters Mentoring', 'TOASTMASTERS メンタリング入門', '（見本）メンターの説明', '(sample) mentoring purpose'],
  ['', '', '', '', '', '', '']
];

test('プロジェクト説明シートの読み込み', () => {
  const projects = gas.parseProjectSheet(PROJECT_SHEET);
  assert.equal(projects.length, 3); // 見出し行と空行は除く
  assert.deepEqual({ ...projects[1] }, {
    row: 38, code: '8321', level: 'Lvl.3', name_en: 'Researching and Presenting', name_ja: 'リサーチとプレゼンテーション',
    desc_ja: '（見本）リサーチの説明', desc_en: ''
  });
  assert.deepEqual(Array.from(gas.parseProjectSheet([])), []);
  // 列の順番が違っても見出しで読む
  const swapped = PROJECT_SHEET.map((r) => [r[6], r[5], r[4], r[3], r[2], r[1], r[0]]);
  assert.equal(gas.parseProjectSheet(swapped)[0].desc_ja, '（見本）ボーカルバラエティの説明');
});

test('プロジェクト説明：名前・行番号で引き、言語に応じた説明を入れる', async (t) => {
  const projects = gas.parseProjectSheet(PROJECT_SHEET);
  const findProject = (s) => gas.findProjectInfo(s, projects);

  await t.test('384：日本語は日本語の説明、英語は英語の説明が空なので見出しのみ＋警告', () => {
    const plan = gas.buildFillPlan(meeting('384'), { zoom: ZOOM, findProject });
    assert.equal(plan.objectives[0].description, '（見本）ボーカルバラエティの説明');
    assert.equal(plan.objectives[1].title, 'L3: Researching and Presenting');
    assert.equal(plan.objectives[1].description, '');
    assert.deepEqual(Array.from(plan.warnings), ['プロジェクト「Researching and Presenting」の説明が見つかりません（見出しのみ記入）']);
  });
  await t.test('386：新形式は行番号（range=A11）で引く。英語名のプロジェクトでも日本語セッションなら日本語の説明', () => {
    const plan = gas.buildFillPlan(meeting('386'), { zoom: ZOOM, findProject });
    assert.equal(gas.findProjectInfo(meeting('386').speeches.ja[0], projects).code, '8204');
    assert.equal(plan.objectives[0].description, '（見本）メンターの説明');
    assert.equal(plan.warnings.length, 0);
  });
  await t.test('見つからない名前は null', () => {
    assert.equal(gas.findProjectInfo({ project: '存在しないプロジェクト' }, projects), null);
  });
});

test('対象回の選択（Upcoming）', () => {
  const upcoming = gas.parseUpcomingFromHtml(readFixture('top_page.html'));
  assert.equal(gas.selectNextMeeting(upcoming, '2026/10/26').number, 386);
  assert.equal(gas.selectNextMeeting(upcoming, '2026/11/05').number, 386); // 当日も「次回」
  assert.equal(gas.selectNextMeeting(upcoming, '2026/11/06').number, 387);
  assert.equal(gas.selectNextMeeting(upcoming, '2030/01/01'), null);
  assert.equal(gas.selectTodaysMeeting(upcoming, '2026/11/05').mtgid, 259);
  assert.equal(gas.selectTodaysMeeting(upcoming, '2026/11/12'), null); // 例会の無い木曜
});

test('PDF にするプログラムの選択：名前の形が合うもののうち、最後に更新したもの', () => {
  const files = [
    { id: 'a', name: '新宿BTMC第385回例会プログラム20261015', updated: new Date('2026-10-15T10:00:00Z') },
    { id: 'b', name: '新宿BTMC第386回例会プログラム20261105', updated: new Date('2026-11-02T13:00:00Z') },
    { id: 't', name: 'template', updated: new Date('2026-11-03T00:00:00Z') }, // テンプレートは対象外
    { id: 'p', name: '新宿BTMC第386回例会プログラム20261105.pdf', updated: new Date('2026-11-03T01:00:00Z') } // PDF も対象外
  ];
  assert.equal(gas.selectLatestProgram(files).id, 'b');
  assert.equal(gas.selectLatestProgram([{ id: 't', name: 'template', updated: new Date() }]), null);
  // fileName と同じ形であること
  assert.match(gas.buildFillPlan(meeting('384'), { zoom: ZOOM }).fileName, gas.PROGRAM_FILE_NAME);
});

test('parseEventSheet：その回の行だけ、見出しの文字で列を探す', () => {
  const values = [
    ['例会回', 'イベント名', '挿入位置', '所要時間（分）', '担当者'],
    [384, '入会式', '休憩の前', 15, ''],
    ['第385回', 'ワークショップ', '前半スピーチの後', '20', '山田'],
    [384, '', '閉会の前', 5, ''],
    ['384', '役員就任式', '閉会の前', '', '佐藤']
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(gas.parseEventSheet(values, 384))), [
    { name: '入会式', position: '休憩の前', minutes: 15, person: '' },
    { name: '役員就任式', position: '閉会の前', minutes: 0, person: '佐藤' }
  ]);
  assert.equal(gas.parseEventSheet(values, 385)[0].name, 'ワークショップ');
  assert.equal(gas.parseEventSheet([], 384).length, 0);
});

test('イベントの挿入（384・休憩の前）：担当者はページの役割から、下の行はずれる', () => {
  const m = meeting('384', 257);
  m.roles['入会式担当'] = '山田 太郎';
  const plan = gas.buildFillPlan(m, { zoom: ZOOM, events: [{ name: '入会式', position: '休憩の前', minutes: 15, person: '' }] });
  const c = cellMap(plan);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.inserts)), [{ after: 40, count: 1, from: 41 }]);
  assert.equal(c.E41, '入会式');
  assert.equal(c.C41, '15分');
  assert.equal(c.J41, '山田 太郎');
  // 後半の記入先は 1 行下にずれる
  assert.equal(c.J46, m.speeches.en[0].speaker);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.timing)), { endRow: 70, tt: [[32, 33, 34], [56, 57, 58]], breakRow: 42, geRows: [38, 63] });
  assert.ok(!plan.warnings.some((w) => w.includes('入会式担当')));
});

test('イベント：位置が選択肢に無い・ページの役割がシートに無いときは警告', () => {
  const m = meeting('384', 257);
  m.roles['ワークショップ'] = '山田 太郎';
  const plan = gas.buildFillPlan(m, { zoom: ZOOM, events: [{ name: '虎の穴', position: 'どこか', minutes: 10, person: '' }] });
  assert.equal(plan.inserts.length, 0);
  assert.ok(plan.warnings.some((w) => w.includes('「どこか」が選択肢にない')));
  assert.ok(plan.warnings.some((w) => w.includes('「ワークショップ」（担当：山田 太郎）')));
});

test('イベントとスピーチ 3 本が同じ位置：スピーチのブロックの後にイベント', () => {
  const m = meeting('384', 257);
  const base = m.speeches.en[0];
  m.speeches.en = [1, 2, 3].map((slot) => ({ ...base, slot }));
  const events = [
    { name: 'A', position: '後半スピーチの後', minutes: 5, person: '' },
    { name: 'B', position: '後半スピーチの後', minutes: 5, person: '' },
    { name: 'C', position: '前半スピーチの後', minutes: 5, person: '' }
  ];
  const plan = gas.buildFillPlan(m, { zoom: ZOOM, events });
  const c = cellMap(plan);
  // C：前半 28 行の後（29 行目の前）。休憩の行 41 は、C の分ずれて 42 から複写
  // 後半スピーチ 3 のブロック（52 行の後に 4 行）→ A → B、最後に論評 3（論評 2 の 61 行はここまでの 7 行分ずれて 68）
  assert.deepEqual(JSON.parse(JSON.stringify(plan.inserts)), [
    { after: 28, count: 1, from: 41 },
    { after: 53, count: 4, from: 50, label: 'F54' },
    { after: 57, count: 1, from: 42 },
    { after: 58, count: 1, from: 42 },
    { after: 68, count: 1, from: 68, label: 'F69' }
  ]);
  assert.equal(c.E29, 'C');
  assert.equal(c.E58, 'A');
  assert.equal(c.E59, 'B');
  assert.equal(c.F55, gas.formatSpeechTitle(base, 'en')); // 3 本目のタイトル（F50 は C の分ずれて F51、その 4 行下）
});

test('planTimeFit：テーブルトピック③ → 休憩 → 総合論評 → テーブルトピック②の順に、超過がなくなるまで', () => {
  const timing = { tt: [[32, 33, 34], [55, 56, 57]], breakRow: 41, geRows: [38, 62] };
  const fit = (over) => JSON.parse(JSON.stringify(gas.planTimeFit(over, timing)));
  assert.deepEqual(fit(0).hideRows, []);
  assert.deepEqual(fit(0).minutes, []);
  assert.deepEqual(fit(1).hideRows, [57]);
  assert.deepEqual(fit(1).minutes, []);
  // 通常の回（日英スピーチ 2 本ずつ、21:27 終了 = 12 分超過）：テーブルトピック各 2 人、休憩 5 分、前半の総合論評 6 分
  const normal = fit(12);
  assert.deepEqual(normal.hideRows, [57, 34]);
  assert.deepEqual(normal.minutes, [{ row: 41, minutes: 5 }, { row: 38, minutes: 6 }]);
  assert.equal(normal.over, 0);
  // 減らしきっても残る分は over に
  const big = fit(30);
  assert.deepEqual(big.hideRows, [57, 34, 56, 33]);
  assert.deepEqual(big.minutes, [{ row: 41, minutes: 5 }, { row: 38, minutes: 5 }, { row: 62, minutes: 5 }]);
  assert.equal(big.over, 9);
});

test('timeFitMessage', () => {
  const timing = { tt: [[32, 33, 34], [55, 56, 57]], breakRow: 41, geRows: [38, 62] };
  assert.equal(gas.timeFitMessage(21 * 60 + 27, 21 * 60 + 15, gas.planTimeFit(12, timing)),
    '終了予定が 21:27 になるため調整しました：テーブルトピック 2 人減（行を非表示）、休憩 5 分、総合論評 前半 6 分（終了予定 21:15）');
  assert.equal(gas.timeFitMessage(21 * 60 + 17, 21 * 60 + 14, gas.planTimeFit(2, timing)),
    '終了予定が 21:17 になるため調整しました：テーブルトピック 1 人減（行を非表示）（終了予定 21:14）');
});

test('イベント：会長挨拶・ゲスト紹介の後（10 行目の前）。右欄の行番号はそのまま', () => {
  const m = meeting('384', 257);
  const plan = gas.buildFillPlan(m, { zoom: ZOOM, events: [{ name: '入会式', position: '会長挨拶・ゲスト紹介の後', minutes: 10, person: '' }] });
  const c = cellMap(plan);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.inserts)), [{ after: 9, count: 1, from: 41 }]);
  assert.equal(c.E10, '入会式');
  assert.equal(c.J11, m.roles['今夜のトーストマスター']); // TMOE は 1 行下
  assert.equal(c.O7, m.guests.filter((g) => !g.includes('キャンセル'))[0]); // ゲスト欄は 7 行目から
  assert.deepEqual(JSON.parse(JSON.stringify(plan.timing)), { endRow: 70, tt: [[33, 34, 35], [56, 57, 58]], breakRow: 42, geRows: [39, 63] });
});

test('clockMinutes / formatClock', () => {
  assert.equal(gas.clockMinutes('21:27'), 21 * 60 + 27);
  assert.equal(gas.clockMinutes('0:01'), 1);
  assert.equal(gas.clockMinutes(''), 0);
  assert.equal(gas.formatClock(21 * 60 + 5), '21:05');
});
