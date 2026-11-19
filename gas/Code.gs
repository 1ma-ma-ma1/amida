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
  if (!game) return drawMenu_();
  if (!Object.prototype.hasOwnProperty.call(DRAW_PAGES, game)) {
    return HtmlService.createHtmlOutput('<p>抽選方法が見つかりません。メニューから選び直してください。</p>');
  }
  const page = DRAW_PAGES[game];
  let source;
  try {
    const response = UrlFetchApp.fetch(DRAW_ASSETS + page.path, {muteHttpExceptions:true});
    if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
    source = response.getContentText('UTF-8');
    if (!source.includes('</html>')) throw new Error('HTMLの取得内容が不完全です。');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;padding:20px"><h2>抽選画面を読み込めませんでした</h2><p>公開ページの読み込みに失敗しました。スタッフにお知らせください。</p><p>エラー：' + escapeDrawHtml_(String(error.message || error)) + '</p><p><a href="' + ScriptApp.getService().getUrl() + '">抽選一覧に戻る</a></p></body></html>');
  }
  // 静的アセットはGitHub Pagesから配信し、抽選処理だけGASのgoogle.script.runを使用する。
  // HTML内の相対URLは絶対URLに置換。戻るリンクは本番GASのメニューへ。
  const base = DRAW_ASSETS + page.path;
  const html = source.replace('<head>', '<head><base target="_top"><script>window.DrawRecording = true;</script>')
    .replace(/(src|href)="([^"<>]+)"/g, function(full, attr, url) {
      if (url === '../#draw-menu' || (game === 'amida' && url === './')) {
        return attr + '="' + ScriptApp.getService().getUrl() + '"';
      }
      if (/^(?:https?:|data:|mailto:|tel:|#)/i.test(url)) return full;
      return attr + '="' + resolveDrawUrl_(base, url) + '"';
    });
  return HtmlService.createHtmlOutput(html).setTitle(page.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function escapeDrawHtml_(value) {
  return value.replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function resolveDrawUrl_(base, path) {
  const parts = (base + path).replace(/^https:\/\//, '').split('/');
  const host = parts.shift(), output = [];
  parts.forEach(function(part) {
    if (part === '..') output.pop();
    else if (part && part !== '.') output.push(part);
  });
  return 'https://' + host + '/' + output.join('/');
}

function drawMenu_() {
  const root = ScriptApp.getService().getUrl();
  const cards = Object.keys(DRAW_PAGES).map(function(key, i) {
    const game = DRAW_PAGES[key];
    return '<a class="choice" target="_top" href="' + root + '?game=' + key + '"><span class="num">0' + (i + 1) +
      '</span><strong>' + game.name + '</strong><small>タップして抽選へ</small></a>';
  }).join('');
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_top"><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f6f0;color:#34483d;font:14px/1.8 "Yu Gothic",Meiryo,sans-serif}main{max-width:680px;margin:auto;padding:42px 18px 60px}p{text-align:center;color:#778075;font-size:12px}h1{text-align:center;font:500 31px/1.6 "Yu Mincho",serif}.eyebrow{color:#b08d50;letter-spacing:.2em}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.choice{min-height:125px;background:#fffefa;border:1px solid #d6ddcf;border-radius:18px;padding:19px;color:#34483d;text-decoration:none;display:flex;flex-direction:column;justify-content:center;box-shadow:0 8px 22px #34483d10}.choice:focus-visible{outline:3px solid #b08d50}.num{color:#b08d50;font-size:11px}.choice strong{font:500 19px/1.7 "Yu Mincho",serif}.choice small{color:#778075}@media(max-width:420px){.grid{grid-template-columns:1fr}.choice{min-height:93px}}</style></head><body>' +
    '<main><p class="eyebrow">A LITTLE GIFT FOR YOU</p><h1>お好きな抽選をお選びください</h1><p>4つの抽選からお好きなものを選択してください。</p><nav class="grid">' +
    cards + '</nav><p>抽選後は受付番号と結果をスタッフにお見せください。</p></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ご褒美抽選')
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
      return {id,index:Number(rank[1])-1,drawnAt:new Date(sheet.getRange(row,1).getValue()).toISOString()};
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

// 付与済みへの変更はスタッフが管理表のE列を直接操作します。
// 受付番号は一意で、同じ受付番号の再送信は既存の抽選結果を返し、行を増やしません。
// 本人確認を行わないため、別の受付番号での再抽選はシステムだけでは防げません。
