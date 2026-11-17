const DRAW_PAGES = {
  amida: { tab: 'あみだくじ', path: '', prefix: 'AM-' },
  roulette: { tab: 'ルーレット', path: 'roulette/', prefix: 'RL-' }
};
const DRAW_HEADERS = ['抽選日時', '当選等賞', '管理番号', '氏名'];
const DRAW_ASSETS = 'https://1ma-ma-ma1.github.io/amida/';

function doGet(event) {
  if (!isDrawStaff_()) return HtmlService.createHtmlOutput('スタッフ用ページです。許可されたGoogleアカウントで開いてください。');
  const game = event && event.parameter.game;
  if (!Object.prototype.hasOwnProperty.call(DRAW_PAGES, game)) {
    const url = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><base target="_top"></head><body>' +
      '<h1>スタッフ用・抽選記録</h1><ul><li><a href="' + url + '?game=amida">あみだくじ</a></li>' +
      '<li><a href="' + url + '?game=roulette">ルーレット</a></li></ul></body></html>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const page = DRAW_PAGES[game];
  const source = UrlFetchApp.fetch(DRAW_ASSETS + page.path).getContentText('UTF-8');
  // Resolve public styles, scripts, and illustrations inside the Apps Script iframe.
  const html = source.replace(/(src|href)="(\.\.\/|\.\/)([^"<>]*)"/g,
    (_, attr, parent, asset) => attr + '="' + DRAW_ASSETS + (parent === '../' ? '' : page.path) + asset + '"');
  return HtmlService.createHtmlOutput(html).setTitle(page.tab + '｜記録用')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function recordDraw(input) {
  if (!isDrawStaff_()) throw new Error('スタッフのアカウントで開き直してください。');
  if (!input || !Object.prototype.hasOwnProperty.call(DRAW_PAGES, input.game)) throw new Error('抽選種別が無効です。');
  const page = DRAW_PAGES[input.game];
  const id = input.id;
  const prize = typeof input.prize === 'string' ? input.prize.trim() : '';
  if (typeof id !== 'string' || !new RegExp('^' + page.prefix + '[A-F0-9]{16}$').test(id) ||
      !prize || prize.length > 200 || /^[=+\-@]/.test(prize) || /[\u0000-\u001f\u007f]/.test(prize)) {
    throw new Error('抽選データが無効です。');
  }
  const sheetId = PropertiesService.getScriptProperties().getProperty('DRAW_SHEET_ID');
  if (!sheetId) throw new Error('記録先が設定されていません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(page.tab);
    if (!sheet || DRAW_HEADERS.some((label, i) => sheet.getRange(1, i + 1).getDisplayValue() !== label)) {
      throw new Error('管理表のタブ名と見出しを確認してください。');
    }
    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1 ? sheet.getRange(2, 3, lastRow - 1, 1).createTextFinder(id).matchEntireCell(true).findNext() : null;
    if (existing) {
      if (sheet.getRange(existing.getRow(), 2).getDisplayValue() !== prize) throw new Error('管理番号が重複しました。');
      return { id };
    }
    const row = lastRow + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    sheet.getRange(row, 4).setNumberFormat('@');
    sheet.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.getRange(row, 1, 1, 4).setValues([[new Date(), prize, id, '']]);
    SpreadsheetApp.flush();
    return { id };
  } finally {
    lock.releaseLock();
  }
}

function isDrawStaff_() {
  const user = Session.getActiveUser().getEmail().trim().toLowerCase();
  const value = PropertiesService.getScriptProperties().getProperty('DRAW_STAFF_EMAILS') || '';
  return !!user && value.split(',').some(email => email.trim().toLowerCase() === user);
}
