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

test('警告：Zoom 未設定、未登録の会場、3 本目のスピーチ', () => {
  const m = meeting('384');
  m.venue = '新しいセンター';
  m.speeches.ja.push({ ...m.speeches.ja[0], slot: 3 });
  const plan = gas.buildFillPlan(m, {});
  const c = cellMap(plan);
  assert.equal(c.J3, '会場：新しいセンター 集会室３');
  assert.ok(plan.warnings.some((w) => w.includes('Zoom')));
  assert.ok(plan.warnings.some((w) => w.includes('新しいセンター')));
  assert.ok(plan.warnings.some((w) => w.includes('準備スピーチ3')));
});
