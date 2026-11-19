// 「サロン抽選管理_2026」専用。既存NFCのプロジェクトには貼り付けないでください。
const SHEET_ID = 'YOUR_SPREADSHEET_ID';
const DRAW_TAB = '抽選履歴';
const DRAW_HEADERS = ['抽選日時', '抽選方法', '抽選結果', '受付番号', '特典の付与'];
const DRAW_CAMPAIGN = 'salon-amida-2026-01';
// UIの確定したGitHubコミット。公開中のPagesや旧GASには依存しません。
const DRAW_UI_REF = 'd01e4d4957e356e2d72f4ebb9b024f01adc4060a';
const DRAW_SOURCE = 'https://raw.githubusercontent.com/1ma-ma-ma1/amida/' + DRAW_UI_REF + '/';
const AMIDA_PRIZES = [
  { rank: 1, title: '10分延長', description: '（1320円引き）' },
  { rank: 2, title: 'オプション半額', description: '' },
  { rank: 3, title: '温活無料', description: '' },
  { rank: 4, title: '温活無料', description: '' },
  { rank: 5, title: 'スタンプ+1', description: '' }
];

function doGet(event) {
  try {
    const game = event && event.parameter && event.parameter.game;
    if (game && game !== 'amida') throw new Error('現在はあみだくじのみ接続確認中です。');
    const runtime = {
      protocol: 3, namespace: ScriptApp.getScriptId(),
      campaignId: DRAW_CAMPAIGN, prizes: AMIDA_PRIZES
    };
    const boot = '<script>window.DrawRecording=true;window.DrawRuntime=' +
      JSON.stringify(runtime).replace(/</g, '\\u003c') + ';</script>';
    const html = loadDrawHtml_().replace('<head>', function() { return '<head><base target="_top">' + boot; })
      .replace('href="./"', 'href="' + escapeDrawHtml_(ScriptApp.getService().getUrl()) + '"');
    return HtmlService.createHtmlOutput(html).setTitle('癒やしのあみだくじ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><body><h1>抽選画面を開けません</h1><p>' +
      escapeDrawHtml_(String(error.message || error)) + '</p><p>スタッフへお知らせください。</p></body></html>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function loadDrawHtml_() {
  if (!/^[a-f0-9]{40}$/.test(DRAW_UI_REF)) throw new Error('画面のバージョン設定が未完了です。');
  const cache = CacheService.getScriptCache();
  const key = 'amida-ui-v3:' + DRAW_UI_REF;
  const cached = cache.get(key);
  if (cached) return cached;
  const paths = ['index.html', 'style.css', 'leaf.svg', 'draw-log.js', 'config.js', 'amida.js', 'storage.js', 'app.js'];
  const responses = UrlFetchApp.fetchAll(paths.map(function(path) {
    return { url: DRAW_SOURCE + path, muteHttpExceptions: true };
  }));
  const files = {};
  responses.forEach(function(response, i) {
    if (response.getResponseCode() !== 200) throw new Error('画面ファイルを取得できません: ' + paths[i]);
    files[paths[i]] = response.getContentText('UTF-8');
  });
  let html = files['index.html'];
  if (!html.includes('</html>')) throw new Error('画面ファイルが不完全です。');
  // サーバーでJSとCSSを取り込み、GASのHTMLサービス内で実行する。
  // Pagesからのfetch/no-cors/JSONPや外側iframeへのRPC転送は使用しない。
  html = html.replace(/<script\b[^>]*\bsrc="\.\/[^"]+"[^>]*><\/script>/g, '');
  html = html.replace('<link rel="stylesheet" href="./style.css">', function() { return '<style>' + files['style.css'] + '</style>'; });
  html = html.replace(/\.\/leaf\.svg/g, 'data:image/svg+xml;base64,' + Utilities.base64Encode(files['leaf.svg'], Utilities.Charset.UTF_8));
  html = html.replace(/<nav class="draw-menu"[\s\S]*?<\/nav>/, '');
  const scripts = paths.slice(3).map(function(path) {
    return '<script>' + files[path].replace(/<\/script/gi, '<\\/script') + '</script>';
  }).join('\n');
  html = html.replace('</body>', function() { return scripts + '</body>'; });
  cache.put(key, html, 300);
  return html;
}

function escapeDrawHtml_(value) {
  return String(value).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
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

function drawResult_(values, id) {
  const match = /^([1-5])等 (.+)$/.exec(String(values[2]));
  const date = new Date(values[0]);
  if (!match || values[1] !== 'あみだくじ' || values[3] !== id || !Number.isFinite(date.getTime())) {
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
  if (!input || input.protocol !== 3 || input.game !== 'amida' || input.campaignId !== DRAW_CAMPAIGN ||
      typeof input.id !== 'string' || !/^AM-[A-F0-9]{32}$/.test(input.id)) {
    throw new Error('参加記録が不正です。新しい抽選画面から操作してください。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = drawSheet_();
    const last = sheet.getLastRow();
    const existing = last > 1 ? sheet.getRange(2, 4, last - 1, 1).createTextFinder(input.id)
      .matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext() : null;
    if (existing) return drawResult_(sheet.getRange(existing.getRow(), 1, 1, 5).getValues()[0], input.id);
    const prize = AMIDA_PRIZES[Math.floor(Math.random() * AMIDA_PRIZES.length)];
    const row = [new Date(), 'あみだくじ', prize.rank + '等 ' + prize.title + prize.description, input.id, '未付与'];
    // 受付番号と結果を同じ1行で保存。列追加・既存行の更新・削除は行わない。
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return drawResult_(row, input.id);
  } finally {
    lock.releaseLock();
  }
}

function testSheetConnection() {
  const sheet = drawSheet_();
  Logger.log('接続成功 / シート: ' + sheet.getName() + ' / 最終行: ' + sheet.getLastRow());
  return '接続成功';
}

// 手動実行。読み取りだけで画面取得に必要な権限を承認・確認する。
function testWebAppPreparation() {
  testSheetConnection();
  const html = loadDrawHtml_();
  Logger.log('画面準備成功 / ' + html.length + '文字 / UI: ' + DRAW_UI_REF);
  return '画面準備成功';
}

// 以前の検証関数は公開Webアプリから新規記録を無制限に作らないよう停止。
function testDrawWrite() {
  throw new Error('書き込み単体テストは完了済みです。新しいWebアプリから接続確認してください。');
}

function drawAmidaPrize(input) {
  return drawPrize(input);
}

// 同じ参加IDの再送は1行にまとめる。別端末・保存データ削除・新規IDによる再抽選は防げない。
// 特典付与はスタッフが既存のE列で管理。スプレッドシートは一般公開しない。

