// 「サロン抽選管理_2026」専用。既存NFCのプロジェクトには貼り付けないでください。
const SHEET_ID = 'YOUR_SPREADSHEET_ID';
const DRAW_TAB = '抽選履歴';
const DRAW_HEADERS = ['抽選日時', '抽選方法', '抽選結果', '受付番号', '特典の付与'];
const DRAW_CAMPAIGN = 'salon-amida-2026-01';
// UIの確定したGitHubコミット。公開中のPagesや旧GASには依存しません。
const DRAW_UI_REF = '6461918a38ecb0baf68ac45ba6c7bac1e0432d61';
const DRAW_SOURCE = 'https://raw.githubusercontent.com/1ma-ma-ma1/amida/' + DRAW_UI_REF + '/';
const DRAW_GAMES = {
  amida: { name: 'あみだくじ', path: 'index.html', prefix: 'AM-' },
  roulette: { name: 'ルーレット', path: 'roulette/index.html', prefix: 'RL-' },
  kuji: { name: 'くじ引き', path: 'kuji/index.html', prefix: 'KJ-' },
  egg: { name: 'たまご抽選', path: 'egg/index.html', prefix: 'EG-' }
};
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
    if (!game) return drawMenu_();
    if (!Object.prototype.hasOwnProperty.call(DRAW_GAMES, game)) throw new Error('抽選方法が見つかりません。');
    const runtime = {
      protocol: 3, namespace: ScriptApp.getScriptId(),
      campaignId: DRAW_CAMPAIGN, prizes: AMIDA_PRIZES
    };
    const boot = '<script>window.DrawRecording=true;window.DrawRuntime=' +
      JSON.stringify(runtime).replace(/</g, '\\u003c') + ';</script>';
    const root = ScriptApp.getService().getUrl();
    const html = loadDrawHtml_(game).replace('<head>', function() { return '<head><base target="_top">' + boot; })
      .replace(/href="\.\.\/#draw-menu"/g, 'href="' + escapeDrawHtml_(root) + '"')
      .replace('href="./"', 'href="' + escapeDrawHtml_(ScriptApp.getService().getUrl()) + '"');
    return HtmlService.createHtmlOutput(html).setTitle(DRAW_GAMES[game].name)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><body><h1>抽選画面を開けません</h1><p>' +
      escapeDrawHtml_(String(error.message || error)) + '</p><p>スタッフへお知らせください。</p></body></html>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function loadDrawHtml_(game = 'amida') {
  if (!/^[a-f0-9]{40}$/.test(DRAW_UI_REF)) throw new Error('画面のバージョン設定が未完了です。');
  const cache = CacheService.getScriptCache();
  const key = 'draw-ui-v4:' + DRAW_UI_REF + ':' + game;
  const cached = cache.get(key);
  if (cached) return cached;
  const paths = game === 'amida'
    ? ['index.html', 'style.css', 'leaf.svg', 'draw-log.js', 'config.js', 'amida.js', 'storage.js', 'app.js']
    : [DRAW_GAMES[game].path, 'leaf.svg', 'storage.js', 'draw-log.js'];
  const responses = UrlFetchApp.fetchAll(paths.map(function(path) {
    return { url: DRAW_SOURCE + path, muteHttpExceptions: true };
  }));
  const files = {};
  responses.forEach(function(response, i) {
    if (response.getResponseCode() !== 200) throw new Error('画面ファイルを取得できません: ' + paths[i]);
    files[paths[i]] = response.getContentText('UTF-8');
  });
  let html = files[DRAW_GAMES[game].path];
  if (!html.includes('</html>')) throw new Error('画面ファイルが不完全です。');
  // サーバーでJSとCSSを取り込み、GASのHTMLサービス内で実行する。
  // Pagesからのfetch/no-cors/JSONPや外側iframeへのRPC転送は使用しない。
  html = html.replace(/<script\b[^>]*\bsrc="(?:\.\/|\.\.\/)[^"]+"[^>]*><\/script>/g, '');
  html = html.replace('<link rel="stylesheet" href="./style.css">', function() { return '<style>' + files['style.css'] + '</style>'; });
  html = html.replace(/(?:\.\.\/|\.\/)leaf\.svg/g, 'data:image/svg+xml;base64,' + Utilities.base64Encode(files['leaf.svg'], Utilities.Charset.UTF_8));
  html = html.replace(/<nav class="draw-menu"[\s\S]*?<\/nav>/, '');
  html = html.replace('テスト期間中は何度でも抽選できます。', '抽選結果を記録します。再表示しても同じ結果です。')
    .replace('テスト版は何度でも遊べます。結果はスクリーンショットで保存できます。', '結果と受付番号をスタッフにお見せください。再読み込み後も同じ抽選結果になります。');
  const scriptPaths = game === 'amida' ? paths.slice(3) : ['storage.js', 'draw-log.js'];
  const scripts = scriptPaths.map(function(path) {
    return '<script>' + files[path].replace(/<\/script/gi, '<\\/script') + '</script>';
  }).join('\n');
  if (game === 'amida') html = html.replace('</body>', function() { return scripts + '</body>'; });
  else html = html.replace('</head>', function() { return scripts + '</head>'; });
  cache.put(key, html, 300);
  return html;
}

function drawMenu_() {
  const root = escapeDrawHtml_(ScriptApp.getService().getUrl());
  const html = "<!doctype html>\n<html lang=\"ja\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <meta name=\"theme-color\" content=\"#526657\">\n  <meta name=\"description\" content=\"4つのご褒美抽選からお好きなものをお選びください。\">\n  <title>ご褒美抽選 | 抽選方法を選ぶ</title>\n  <style>\n    :root{color-scheme:light;--bg:#f7f6f0;--paper:#fffefa;--ink:#34483d;--muted:#778075;--green:#526657;--line:#d6ddcf;--gold:#b08d50;--serif:\"Yu Mincho\",\"Hiragino Mincho ProN\",Georgia,serif;--sans:\"Yu Gothic\",\"Hiragino Kaku Gothic ProN\",Meiryo,sans-serif}\n    *{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(ellipse at 0% 0%,#eaf0e4,transparent 55%),radial-gradient(ellipse at 100% 100%,#f2e9d8,transparent 60%),var(--bg);color:var(--ink);font:14px/1.8 var(--sans)}\n    main{width:min(100%,680px);margin:0 auto;padding:25px 19px 60px}.back{display:inline-flex;align-items:center;min-height:44px;color:var(--green);font-size:12px;text-underline-offset:3px}.brand{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:15px;font-size:12px;color:var(--muted)}.brand img{width:30px;height:30px}\n    .eyebrow{text-align:center;color:var(--gold);font-size:10px;letter-spacing:.22em;margin:27px 0 4px}h1{font:500 clamp(29px,7vw,40px)/1.5 var(--serif);text-align:center;letter-spacing:.06em;margin:0 0 7px}.lead{text-align:center;color:var(--muted);font-size:13px;margin:0 0 25px}\n    nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}nav a{display:flex;flex-direction:column;justify-content:center;min-height:143px;padding:19px;border-radius:19px;border:1px solid var(--line);background:var(--paper);box-shadow:0 12px 28px #34483d10;color:var(--ink);text-decoration:none;transition:transform .2s,border-color .2s}nav a:hover{transform:translateY(-3px);border-color:var(--gold)}nav a:focus-visible,.back:focus-visible{outline:3px solid var(--gold);outline-offset:4px}.num{font-size:11px;color:var(--gold);font-weight:700;letter-spacing:.14em}nav strong{font:500 clamp(16px,4.5vw,22px)/1.6 var(--serif);margin:5px 0}nav small{font-size:11px;color:var(--muted)}.note{text-align:center;font-size:11px;color:var(--muted);margin:25px auto;max-width:470px}\n    @media(max-width:420px){nav{grid-template-columns:1fr;gap:10px}nav a{min-height:102px;padding:15px 18px}}@media(prefers-reduced-motion:reduce){nav a{transition:none}}\n  </style>\n</head>\n<body>\n  <main>\n    <a class=\"back\" href=\"https://1ma-ma-ma1.github.io/salon-nfc-menu/\">← サービスのご案内へ戻る</a>\n    <div class=\"brand\">リラクゼーションサロン</div>\n    <p class=\"eyebrow\">A LITTLE GIFT FOR YOU</p>\n    <h1>お好きな抽選を<br>お選びください</h1>\n    <p class=\"lead\">4つのご褒美抽選から、ひとつを選んでお楽しみください。</p>\n    <nav aria-label=\"抽選方法\">\n      <a href=\"__ROOT__?game=amida\"><span class=\"num\">01</span><strong>癒やしのあみだくじ</strong><small>キャラクターと線をたどる</small></a>\n      <a href=\"__ROOT__?game=roulette\"><span class=\"num\">02</span><strong>ご褒美ルーレット</strong><small>回転とお祝いの演出</small></a>\n      <a href=\"__ROOT__?game=kuji\"><span class=\"num\">03</span><strong>ご褒美くじ引き</strong><small>好きなくじを選んで開く</small></a>\n      <a href=\"__ROOT__?game=egg\"><span class=\"num\">04</span><strong>たまごのご褒美くじ</strong><small>たまごを選んで殻を開く</small></a>\n    </nav>\n    <p class=\"note\">抽選結果と受付番号を保存します。結果画面をスタッフにお見せください。</p>\n  </main>\n</body>\n</html>\n";
  return HtmlService.createHtmlOutput(html.replace(/__ROOT__/g, root))
    .setTitle('ご褒美抽選 | 抽選方法を選ぶ').addMetaTag('viewport', 'width=device-width, initial-scale=1');
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


