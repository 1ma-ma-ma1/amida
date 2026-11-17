// Google Apps Script: GitHub Pagesの各ゲームを読み込み、非公開の抽選履歴に結果を記録します。
// GitHub Pagesを直接開く場合はデモのままで、中央記録は行われません。
const DRAW_PAGES = {
  amida: { name:'あみだくじ', path:'', prefix:'AM-' },
  roulette: { name:'ルーレット', path:'roulette/', prefix:'RL-' },
  kuji: { name:'くじ引き', path:'kuji/', prefix:'KJ-' },
  egg: { name:'たまご抽選', path:'egg/', prefix:'EG-' }
};
const DRAW_TAB = '抽選履歴';
const DRAW_HEADERS = ['抽選日時','抽選方法','抽選結果','受付番号','特典の付与'];
const DRAW_ASSETS = 'https://1ma-ma-ma1.github.io/amida/';

function doGet(event) {
  const game = event && event.parameter && event.parameter.game;
  if (!Object.prototype.hasOwnProperty.call(DRAW_PAGES, game)) {
    const url = ScriptApp.getService().getUrl();
    const links = Object.keys(DRAW_PAGES).map(key => '<li><a href="' + url + '?game=' + key + '">' + DRAW_PAGES[key].name + '</a></li>').join('');
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"></head><body><main><h1>ご褒美抽選</h1><ul>' + links + '</ul></main></body></html>');
  }
  const page = DRAW_PAGES[game];
  const source = UrlFetchApp.fetch(DRAW_ASSETS + page.path).getContentText('UTF-8');
  const html = source.replace('<head>', '<head><script>window.DrawRecording = true;</script>')
    .replace(/(src|href)="(\.\.\/|\.\/)([^"<>]*)"/g,
      (_, attr, parent, asset) => attr + '="' + DRAW_ASSETS + (parent === '../' ? '' : page.path) + asset + '"');
  return HtmlService.createHtmlOutput(html).setTitle(page.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupDrawSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('DRAW_SHEET_ID');
  if (!id) throw new Error('スクリプト プロパティ DRAW_SHEET_ID を設定してください。');
  const book = SpreadsheetApp.openById(id);
  const sheet = book.getSheetByName(DRAW_TAB) || book.insertSheet(DRAW_TAB);
  if (sheet.getLastRow() > 0) {
    const existing = sheet.getRange(1,1,1,5).getDisplayValues()[0];
    if (existing.some(Boolean) && DRAW_HEADERS.some((name,i)=>existing[i]!==name))
      throw new Error('抽選履歴の既存見出しが異なります。上書きせず停止しました。');
  }
  sheet.getRange(1,1,1,5).setValues([DRAW_HEADERS]).setFontWeight('bold').setBackground('#e5ede5');
  sheet.setFrozenRows(1);
  sheet.getRange('D:D').setNumberFormat('@');
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(['未付与','付与済み'],true).setAllowInvalid(false).build();
  sheet.getRange(2,5,Math.max(1,sheet.getMaxRows()-1),1).setDataValidation(rule);
  sheet.autoResizeColumns(1,5);
  return '抽選履歴を準備しました';
}

function getDrawPrizes_() {
  const cache=CacheService.getScriptCache();
  const key='draw-prizes-v2';
  let cached=cache.get(key);
  if(cached)return JSON.parse(cached);
  const source=UrlFetchApp.fetch(DRAW_ASSETS+'draw-log.js?v=2').getContentText('UTF-8');
  const found=/^\s*globalThis\.DrawPrizes\s*=\s*(\[[\s\S]*?\]);/.exec(source);
  if(!found)throw new Error('特典設定を読み込めません。');
  const prizes=JSON.parse(found[1]);
  if(prizes.length!==5||prizes.some((p,i)=>p.rank!==i+1||!p.title||typeof p.description!=='string'))
    throw new Error('特典設定が不正です。');
  cache.put(key,JSON.stringify(prizes),120);
  return prizes;
}

function drawPrize(input) {
  if(!input||!Object.prototype.hasOwnProperty.call(DRAW_PAGES,input.game))
    throw new Error('抽選種別が無効です。');
  const page=DRAW_PAGES[input.game],id=input.id;
  if(typeof id!=='string'||!new RegExp('^'+page.prefix+'[A-F0-9]{16}$').test(id))
    throw new Error('受付番号が無効です。');
  const sheetId=PropertiesService.getScriptProperties().getProperty('DRAW_SHEET_ID');
  if(!sheetId)throw new Error('記録先が未設定です。');
  const prizes=getDrawPrizes_();
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet=SpreadsheetApp.openById(sheetId).getSheetByName(DRAW_TAB);
    if(!sheet)throw new Error('抽選履歴タブがありません。setupDrawSheetを実行してください。');
    const headers=sheet.getRange(1,1,1,5).getDisplayValues()[0];
    if(DRAW_HEADERS.some((h,i)=>h!==headers[i]))throw new Error('抽選履歴の見出しが不正です。');
    const last=sheet.getLastRow();
    const existing=last>1?sheet.getRange(2,4,last-1,1).createTextFinder(id).matchEntireCell(true).findNext():null;
    if(existing){
      const row=existing.getRow();
      const result=sheet.getRange(row,3).getDisplayValue();
      const rank=/^([1-5])等 /.exec(result);
      if(!rank||sheet.getRange(row,2).getDisplayValue()!==page.name)throw new Error('受付番号が重複しました。');
      return {id,index:Number(rank[1])-1,drawnAt:sheet.getRange(row,1).getValue().toISOString()};
    }
    const index=Math.floor(Math.random()*prizes.length);
    const p=prizes[index],date=new Date(),row=last+1;
    if(row>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);
    sheet.getRange(row,1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.getRange(row,4).setNumberFormat('@');
    sheet.getRange(row,1,1,5).setValues([[date,page.name,p.rank+'等 '+p.title+p.description,id,'未付与']]);
    SpreadsheetApp.flush();
    return {id,index,drawnAt:date.toISOString()};
  }finally{lock.releaseLock();}
}
