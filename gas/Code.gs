const DRAW_PAGES = {
  amida: { tab: 'あみだくじ', path: '', prefix: 'AM-' },
  roulette: { tab: 'ルーレット', path: 'roulette/', prefix: 'RL-' },
  egg: { tab: 'たまご抽選', path: 'egg/', prefix: 'EG-' }
};
const DRAW_HEADERS = ['抽選日時', '当選等賞', '管理番号', '氏名'];
const DRAW_ASSETS = 'https://1ma-ma-ma1.github.io/amida/';

function doGet(event) {
  const game = event?.parameter?.game;
  if (!Object.prototype.hasOwnProperty.call(DRAW_PAGES, game)) {
    const url = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><base target="_top"></head><body>' +
      '<h1>ご褒美抽選</h1><ul><li><a href="' + url + '?game=amida">あみだくじ</a></li>' +
      '<li><a href="' + url + '?game=roulette">ルーレット</a></li>' +
      '<li><a href="' + url + '?game=egg">たまごのご褒美くじ</a></li></ul></body></html>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const page = DRAW_PAGES[game];
  const source = UrlFetchApp.fetch(DRAW_ASSETS + page.path).getContentText('UTF-8');
  const html = source.replace('<head>', '<head><script>window.DrawRecording = true;</script>')
    .replace(/(src|href)="(\.\.\/|\.\/)([^"<>]*)"/g,
      (_, attr, parent, asset) => attr + '="' + DRAW_ASSETS + (parent === '../' ? '' : page.path) + asset + '"');
  return HtmlService.createHtmlOutput(html).setTitle(page.tab)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDrawPrizes_() {
  const cache = CacheService.getScriptCache();
  const key = 'draw-prizes-v2';
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const source = UrlFetchApp.fetch(DRAW_ASSETS + 'draw-log.js?v=2').getContentText('UTF-8');
  const body = /^\s*globalThis\.DrawPrizes\s*=\s*(\[[\s\S]*?\]);/.exec(source);
  if (!body) throw new Error('等賞設定を読み込めません。');
  const prizes = JSON.parse(body[1]);
  if (prizes.length !== 5 || prizes.some((p, i) => p.rank !== i + 1 || !p.title || typeof p.description !== 'string')) {
    throw new Error('等賞設定を確認してください。');
  }
  cache.put(key, JSON.stringify(prizes), 120);
  return prizes;
}

function drawPrize(input) {
  if (!input || !Object.prototype.hasOwnProperty.call(DRAW_PAGES, input.game)) throw new Error('抽選種別が無効です。');
  const page = DRAW_PAGES[input.game];
  const id = input.id;
  if (typeof id !== 'string' || !new RegExp('^' + page.prefix + '[A-F0-9]{16}$').test(id)) throw new Error('管理番号が無効です。');
  const sheetId = PropertiesService.getScriptProperties().getProperty('DRAW_SHEET_ID');
  if (!sheetId) throw new Error('記録先が設定されていません。');
  const prizes = getDrawPrizes_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(page.tab);
    const headers = sheet && sheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
    if (!headers || DRAW_HEADERS.some((label, i) => headers[i] !== label)) throw new Error('管理表の見出しを確認してください。');
    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1 ? sheet.getRange(2, 3, lastRow - 1, 1).createTextFinder(id).matchEntireCell(true).findNext() : null;
    if (existing) {
      const row = existing.getRow();
      const rank = /^([1-5])等 /.exec(sheet.getRange(row, 2).getDisplayValue());
      if (!rank) throw new Error('管理番号が重複しました。');
      return { id, index: Number(rank[1]) - 1, drawnAt: sheet.getRange(row, 1).getValue().toISOString() };
    }
    const index = Math.floor(Math.random() * prizes.length);
    const prize = prizes[index];
    const row = lastRow + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    const drawnAt = new Date();
    sheet.getRange(row, 4).setNumberFormat('@');
    sheet.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.getRange(row, 1, 1, 4).setValues([[drawnAt, `${prize.rank}等 ${prize.title}${prize.description}`, id, '']]);
    SpreadsheetApp.flush();
    return { id, index, drawnAt: drawnAt.toISOString() };
  } finally {
    lock.releaseLock();
  }
}
