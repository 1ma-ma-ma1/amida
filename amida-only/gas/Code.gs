// 「あみだくじ企画_仮」専用。既存サロンGASには貼り付けないでください。
const SHEET_ID = 'YOUR_SPREADSHEET_ID';
const DRAW_TAB = '抽選履歴';
const DRAW_HEADERS = ['抽選日時', '抽選方法', '抽選結果', '受付番号', '特典の付与'];
const DRAW_CAMPAIGN = 'amida-only-2026-01';
const DRAW_GAMES = { amida: { name: 'あみだくじ', prefix: 'AM-' } };
const AMIDA_PRIZES = [
  { rank: 1, title: '10分延長', description: '（1320円引き）' },
  { rank: 2, title: 'オプション半額', description: '' },
  { rank: 3, title: '温活無料', description: '' },
  { rank: 4, title: '温活無料', description: '' },
  { rank: 5, title: 'スタンプ+1', description: '' }
];

// GitHub画面からの通信専用。HTMLは返さず、記録が確定した結果だけを返します。
function doPost(event) {
  let result;
  try {
    const body = event && event.postData && event.postData.contents;
    if (typeof body !== 'string' || body.length > 4000) throw new Error('リクエストが不正です。');
    const input = JSON.parse(body);
    if (input && input.action === 'health') {
      result = { success: true, protocol: 3, transport: 'json', campaignId: DRAW_CAMPAIGN };
    } else {
      result = drawPrize(input);
    }
  } catch (error) {
    result = { success: false, error: String(error.message || error) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ success: true, protocol: 3, campaignId: DRAW_CAMPAIGN })).setMimeType(ContentService.MimeType.JSON);
}

function drawSheet_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DRAW_TAB);
  if (!sheet) throw new Error('抽選履歴シートが見つかりません');
  const actual = sheet.getRange(1, 1, 1, 5).getDisplayValues()[0];
  if (DRAW_HEADERS.some(function(name, i) { return actual[i] !== name; })) {
    throw new Error('抽選履歴の見出しが一致しません。既存データは変更していません。');
  }
  return sheet;
}

function drawResult_(values, id, game = 'amida') {
  const match = /^([1-5])等 (.+)$/.exec(String(values[2]));
  const date = new Date(values[0]);
  if (!match || values[1] !== DRAW_GAMES[game].name || values[3] !== id || !Number.isFinite(date.getTime())) {
    throw new Error('保存済みの抽選記録を確認できません。スタッフへお知らせください。');
  }
  const detail = /^(.*?)(（[^）]+）)$/.exec(match[2]);
  return {
    protocol: 3, success: true, id: id, receiptId: id,
    index: Number(match[1]) - 1,
    // 特典変更後も当時シートに保存した文面を返す。
    prize: { rank: Number(match[1]), title: detail ? detail[1] : match[2], description: detail ? detail[2] : '' },
    drawnAt: date.toISOString()
  };
}

function drawPrize(input) {
  if (!input || input.protocol !== 3 || !Object.prototype.hasOwnProperty.call(DRAW_GAMES, input.game) || input.campaignId !== DRAW_CAMPAIGN ||
      typeof input.id !== 'string' || !new RegExp('^' + DRAW_GAMES[input.game].prefix + '[A-F0-9]{32}$').test(input.id)) {
    throw new Error('参加記録が不正です。新しい抽選画面から操作してください。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = drawSheet_();
    const last = sheet.getLastRow();
    const existing = last > 1 ? sheet.getRange(2, 4, last - 1, 1).createTextFinder(input.id)
      .matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext() : null;
    if (existing) return drawResult_(sheet.getRange(existing.getRow(), 1, 1, 5).getValues()[0], input.id, input.game);
    const prize = AMIDA_PRIZES[Math.floor(Math.random() * AMIDA_PRIZES.length)];
    const row = [new Date(), DRAW_GAMES[input.game].name, prize.rank + '等 ' + prize.title + prize.description, input.id, '未付与'];
    // 受付番号と結果を同じ1行で保存。列追加・既存行の更新・削除は行わない。
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return drawResult_(row, input.id, input.game);
  } finally {
    lock.releaseLock();
  }
}

function testSheetConnection() {
  const sheet = drawSheet_();
  Logger.log('接続成功 / シート: ' + sheet.getName() + ' / 最終行: ' + sheet.getLastRow());
  return '接続成功';
}

// 同じ参加IDの再送は1行にまとめる。別端末・保存データ削除・新規IDによる再抽選は防げない。
// 特典付与はスタッフが既存のE列で管理。スプレッドシートは一般公開しない。

