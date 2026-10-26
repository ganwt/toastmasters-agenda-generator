// 開発用の関数（メニューには出さない。Apps Script のエディタから実行する）

// スピーチ 3 本の行挿入の確認用：第 384 回のデータを元に、両セッションともスピーチ 3 本にした人工データで作成する
function testThreeSpeeches() {
  var m = fetchMeeting(257);
  ['ja', 'en'].forEach(function (lang) {
    var base = m.speeches[lang][0];
    [2, 3].forEach(function (slot) {
      var s = JSON.parse(JSON.stringify(base));
      s.slot = slot;
      s.title = '（テスト）' + slot + ' 本目';
      m.speeches[lang].push(s);
    });
  });
  m.speeches.ja[2].time_limit = { min: 4, max: 6 };
  m.number = 999; // ファイル名で本番と区別する
  var r = createProgramFromMeeting(m);
  Logger.log(r.url);
}

// 定期実行の確認用：日付を指定して、定期実行と同じ処理を行う
function testScheduledOnMeetingDay() { runScheduled('2026/11/05'); } // 第 386 回の当日 → 作成（2 回目は「作成済み」）
function testScheduledOnOtherDay() { runScheduled('2026/11/12'); } // 例会の無い木曜 → 何もしない
