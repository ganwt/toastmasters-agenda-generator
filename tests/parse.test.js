// 実行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, readFixture } = require('./gas');

const gas = loadGas();
const find = (list, name) => list.find((a) => a.name === name);

test('384（JE・会後）', async (t) => {
  const m = gas.parseMeeting(readFixture('384_page.html'), readFixture('384_members.html'), 257);

  await t.test('基本情報', () => {
    assert.equal(m.mtgid, 257);
    assert.equal(m.date, '2026/10/01');
    assert.equal(m.number, 384);
    assert.equal(m.venue, '四谷地域センター');
    assert.equal(m.room, '集会室３');
    assert.equal(m.format, 'JE');
  });
  await t.test('ゲスト', () => {
    assert.deepEqual([...m.guests], ['林さん（Area Director）']);
  });
  await t.test('役割：括弧とさんを除き、名前の空白は保持', () => {
    assert.equal(m.roles['今夜のトーストマスター'], '青木 一郎');
    assert.equal(m.roles['Toastmaster of the Evening'], '久保さくら');
    assert.equal(m.roles['えーとカウンター'], '小川 三郎');
    assert.equal(m.roles['論評1'], '小川 三郎');
    assert.equal(m.roles['General Evaluation'], 'Alex Smith');
    assert.equal(m.roles['論評2'], '');
  });
  await t.test('ゲストが役割に入っている場合（括弧なし）', () => {
    assert.equal(m.roles['テーブルトピックス回答者2'], '林');
  });
  await t.test('日本語スピーチ', () => {
    assert.equal(m.speeches.ja.length, 1);
    assert.deepEqual({ ...m.speeches.ja[0], time_limit: m.speeches.ja[0].time_limit }, {
      slot: 1,
      speaker: '久保さくら',
      path: 'プレゼンテーション熟達',
      level: 'L3',
      level_name: '知識を増やす',
      project: 'ボーカルバラエティについて',
      time_limit: null,
      project_row: null,
      title: '部長の話が聞こえない'
    });
  });
  await t.test('英語スピーチ', () => {
    assert.equal(m.speeches.en.length, 1);
    const s = m.speeches.en[0];
    assert.equal(s.speaker, '小林拓也');
    assert.equal(s.path, 'Motivational Strategies');
    assert.equal(s.level, 'L3');
    assert.equal(s.level_name, 'Increasing Knowledge');
    assert.equal(s.project, 'Researching and Presenting');
    assert.equal(s.title, 'Power of a 100-year vision');
  });
  await t.test('出欠表（ダミー会員を除く）', () => {
    assert.equal(m.attendance.length, 19);
    assert.equal(m.attendance[0].name, '江口次郎さん');
    assert.equal(m.attendance[0].mark, '○');
    assert.equal(find(m.attendance, '久保さくらさん').mark, '◎日本語');
    assert.equal(m.attendance.filter((a) => a.name.startsWith('アサインなし')).length, 0);
  });
  await t.test('Upcoming', () => {
    assert.equal(m.upcoming.length, 5);
    assert.deepEqual({ ...m.upcoming[0] }, { date: '2026/11/05', number: 386, mtgid: 259 });
  });
});

test('385（EJ・会後）', async (t) => {
  const m = gas.parseMeeting(readFixture('385_page.html'), readFixture('385_members.html'));

  await t.test('基本情報', () => {
    assert.equal(m.format, 'EJ');
    assert.equal(m.number, 385);
    assert.equal(m.venue, '角筈地域センター');
    assert.equal(m.room, '会議室A');
  });
  await t.test('キャンセルのゲストも解析結果には残す（除外は記入時）', () => {
    assert.equal(m.guests.length, 2);
    assert.equal(m.guests[0], '山本ジョン太郎さん（キャンセル）');
  });
  await t.test('英語スピーチ 2 本', () => {
    assert.equal(m.speeches.en.length, 2);
    const s = m.speeches.en[1];
    assert.equal(s.slot, 2);
    assert.equal(s.speaker, '上野健太');
    assert.equal(s.path, 'Engaging Humor');
    assert.equal(s.project, 'Using Descriptive Language');
  });
  await t.test('日本語スピーチ', () => {
    const s = m.speeches.ja[0];
    assert.equal(s.speaker, '加藤 四郎');
    assert.equal(s.path, '革新的な企画立案');
    assert.equal(s.level, 'L1');
    assert.equal(s.project, 'リサーチとプレゼンテーション');
    assert.equal(s.title, '私たちは、自滅危惧種なのだろうか？');
  });
  await t.test('EJ でもヘルパーは日本語の役割名で取れる', () => {
    assert.equal(m.roles['計時係'], '小林拓也');
    assert.equal(m.roles['Evaluation2'], '久保さくら');
  });
});

test('386（JE・会前）', async (t) => {
  const m = gas.parseMeeting(readFixture('386_page.html'), readFixture('386_members.html'));

  await t.test('役割が空でもエラーにならない', () => {
    assert.equal(m.format, 'JE');
    assert.equal(m.roles['今夜のトーストマスター'], '');
    assert.equal(m.speeches.en.length, 0);
  });
  await t.test('新形式の項目欄（L2:プロジェクト名＋時限＋一覧へのリンク）', () => {
    assert.equal(m.speeches.ja.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(m.speeches.ja[0])), {
      slot: 1,
      speaker: '佐藤 大輔',
      path: 'Presentation Mastery',
      level: 'L2',
      level_name: '',
      project: 'Introduction to Toastmasters Mentoring',
      time_limit: { min: 5, max: 7 },
      project_row: 11,
      title: '令和バージョン・おじさんの小言'
    });
  });
  await t.test('ゲストと出欠', () => {
    assert.equal(m.guests[0], '森さん（元新宿会員）');
    assert.equal(find(m.attendance, '上野健太さん').mark, '△');
    assert.equal(find(m.attendance, '青木 一郎さん').mark, '');
  });
  await t.test('Upcoming には当期自身も含まれる', () => {
    assert.equal(m.upcoming[0].number, 386);
  });
});

test('TOP ページから Upcoming を読む', () => {
  const list = gas.parseUpcomingFromHtml(readFixture('top_page.html'));
  assert.ok(list.length >= 2);
  assert.equal(list[0].number, 386);
  assert.equal(list[0].mtgid, 259);
});

test('時限とリンク付きの項目欄（人工データ）', async (t) => {
  const html = readFixture('384_page.html');
  const ja = 'ボーカルバラエティについて</div>';
  const en = 'Researching and Presenting</div>';
  const count = (s) => html.split(s).length - 1;

  await t.test('元データに置換対象がちょうど 1 か所ある', () => {
    assert.equal(count(ja), 1);
    assert.equal(count(en), 1);
  });
  await t.test('日本語：（4分から6分）とリンクを項目名から分離', () => {
    const h = html.replace(ja, 'ボーカルバラエティについて<br>（4分から6分）<br><a href="https://example.com/p" target="_blank">プロジェクト説明</a></div>');
    const s = gas.parseMeeting(h).speeches.ja[0];
    assert.equal(s.project, 'ボーカルバラエティについて');
    assert.deepEqual({ ...s.time_limit }, { min: 4, max: 6 });
  });
  await t.test('時限とリンクが項目名と同じ行に付いていても分離', () => {
    const h = html.replace(ja, 'ボーカルバラエティについて（4分から6分）<a href="https://example.com/p">link</a></div>');
    const s = gas.parseMeeting(h).speeches.ja[0];
    assert.equal(s.project, 'ボーカルバラエティについて');
    assert.equal(s.time_limit.max, 6);
  });
  await t.test('英語：(4min - 6min) 形式', () => {
    const h = html.replace(en, 'Researching and Presenting<br>(4min - 6min)<br><a href="https://example.com/p">Project</a></div>');
    const s = gas.parseMeeting(h).speeches.en[0];
    assert.equal(s.project, 'Researching and Presenting');
    assert.deepEqual({ ...s.time_limit }, { min: 4, max: 6 });
  });
});

test('HTML パーサー：<th>…</td> の誤記で外側の表を閉じない', () => {
  const doc = gas.parseHtml('<table id="outer"><tr><td><table id="inner"><tr><th>A</td></tr><tr><td>x</td></tr></table></td><td>y</td></tr></table>');
  const inner = gas.htmlFindAll(doc, (n) => n.attrs.id === 'inner')[0];
  const outer = gas.htmlFindAll(doc, (n) => n.attrs.id === 'outer')[0];
  assert.equal(gas.htmlRows(inner).length, 2);
  assert.equal(gas.htmlCells(gas.htmlRows(outer)[0]).length, 2);
});
