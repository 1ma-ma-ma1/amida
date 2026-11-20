globalThis.DrawPrizes = [
  {"rank":1,"title":"10分延長","description":"（1320円引き）"},
  {"rank":2,"title":"オプション半額","description":""},
  {"rank":3,"title":"温活無料","description":""},
  {"rank":4,"title":"温活無料","description":""},
  {"rank":5,"title":"スタンプ+1","description":""}
];
if (window.DrawRuntime?.protocol === 3) globalThis.DrawPrizes = window.DrawRuntime.prizes;
// GitHub上では画面を移動せず、JSONだけを新GASとやり取りします。
if (!window.DrawRuntime && !window.DrawLocalDemo) {
  window.DrawRecording = true;
  window.DrawRuntime = {
    protocol: 3, namespace: 'salon-nfc-json-2026', campaignId: 'salon-amida-2026-01',
    testMode: false,
    singleChoice: true, // 4種類を通して同じブラウザで1回。参加情報は企画ごとに分離。
    transport: 'fetch', prizes: globalThis.DrawPrizes,
    endpoint: 'https://script.google.com/macros/s/AKfycbzYsk-IEGAhZC6UyCWJzD-M6z151uSnfevvK3tLltwV-iox81KMqbh_E7v7B69Wa7sX9w/exec'
  };
}

(() => {
  'use strict';
  const prefixes = { amida: 'AM-', roulette: 'RL-', egg: 'EG-', kuji: 'KJ-' };
  const recorded = window.DrawRecording === true;
  const pending = new Map();
  const confirmed = new Set();
  const gameNames = {amida:'あみだくじ',roulette:'ルーレット',kuji:'くじ引き',egg:'たまご抽選'};
  const gamePaths = {amida:'https://1ma-ma-ma1.github.io/amida/',roulette:'https://1ma-ma-ma1.github.io/amida/roulette/',kuji:'https://1ma-ma-ma1.github.io/amida/kuji/',egg:'https://1ma-ma-ma1.github.io/amida/egg/'};
  function choiceKey() {
    return 'choice-v1:' + window.DrawRuntime.namespace + ':' + window.DrawRuntime.campaignId;
  }
  function selectionNotice(selection) {
    if (typeof document === 'undefined') return;
    const node = document.getElementById('draw-entry-notice');
    if (!node || !gameNames[selection?.game]) return;
    node.textContent = 'この企画で選択した抽選：' + gameNames[selection.game] + '。';
    const link = document.createElement('a');
    link.href = gamePaths[selection.game] + '?v=single20261120';
    link.textContent = '続き・結果を確認する';
    node.append(link);
  }
  function attemptKey(game) {
    return 'gas-v3:' + window.DrawRuntime.namespace + ':' + window.DrawRuntime.campaignId + (game === 'amida' ? '' : ':' + game);
  }
  async function restart(game, id) {
    if (!window.DrawRuntime?.testMode || !confirmed.has(game + ':' + id)) throw new Error('確定済みのテスト結果だけ再抽選できます。');
    return DrawStore.release(attemptKey(game), id);
  }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
    if (window.DrawRuntime?.singleChoice && !window.DrawRuntime.testMode) {
      const note = document.createElement('p');
      note.id = 'draw-entry-notice';
      note.textContent = 'この企画は、このブラウザで4種類のうち1種類を1回だけ抽選できます。';
      note.style.cssText = 'margin:12px auto;padding:12px;max-width:640px;text-align:center;background:#eef2e8;color:#34483d;border-radius:10px;font-size:13px';
      document.body.prepend(note);
      try { selectionNotice(await DrawStore.read(choiceKey())); }
      catch (_) { note.textContent = '参加記録を確認できません。通常のブラウザで開き直してください。'; }
    }
    if (!window.DrawRuntime?.testMode) return;
    const note = document.createElement('p');
    note.id = 'draw-test-notice';
    note.textContent = 'テスト期間中：何度でも抽選できます。各回の結果は台帳に記録されます。';
    note.style.cssText = 'margin:12px auto;padding:12px;max-width:640px;text-align:center;background:#fff2d5;color:#594823;border-radius:10px;font-size:13px';
    document.body.prepend(note);
  });

  function requestId(game) {
    const key = `draw-pending-v2:${game}`;
    let id = pending.get(game);
    try { id ||= sessionStorage.getItem(key); } catch (_) { /* Storage may be disabled in an embedded browser. */ }
    if (!id || !new RegExp('^' + prefixes[game] + '[A-F0-9]{16}$').test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      id = prefixes[game] + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    pending.set(game, id);
    try { sessionStorage.setItem(key, id); } catch (_) { /* Keep retry continuity in this page. */ }
    return id;
  }

  async function choose(game, localIndex, stableId) {
    if (window.DrawRuntime?.protocol === 3) {
      if (!prefixes[game]) throw new Error('抽選方法が不正です。');
      if (!stableId) {
        if (!prefixes[game]) throw new Error('抽選方法が不正です。');
        const key = attemptKey(game);
        const attempt = await DrawStore.claim(key, { id: newId(game) });
        stableId = attempt.record.id;
      }
      if (!new RegExp('^' + prefixes[game] + '[A-F0-9]{32}$').test(stableId)) throw new Error('参加記録が不正です。');
      if (window.DrawRuntime.singleChoice && !window.DrawRuntime.testMode) {
        const chosen = await DrawStore.claim(choiceKey(), {game, id:stableId});
        const entry = chosen.record;
        selectionNotice(entry);
        if (!gameNames[entry?.game] || entry.game !== game || entry.id !== stableId) {
          throw new Error('この企画はすでに抽選方法を選択しています。画面上部のリンクから続き・結果をご確認ください。');
        }
      }
      return chooseAmida(stableId, game);
    }
    if (!recorded) return Promise.resolve({ index: localIndex, id: null });
    const id = requestId(game);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('記録の応答を確認できません。')), 25000);
      const fail = error => { clearTimeout(timer); reject(error); };
      try {
        window.google.script.run.withSuccessHandler(result => {
          clearTimeout(timer);
          if (result?.id === id && Number.isInteger(result.index) && result.index >= 0 && result.index < DrawPrizes.length) resolve(result);
          else reject(new Error('抽選結果を確認できません。'));
        }).withFailureHandler(fail).drawPrize({ game, id });
      } catch (error) { fail(error); }
    });
  }

  function newId(game = 'amida') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return prefixes[game] + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function chooseAmida(id, game) {
    if (!prefixes[game] || !new RegExp('^' + prefixes[game] + '[A-F0-9]{32}$').test(id)) return Promise.reject(new Error('参加記録が不正です。'));
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error('応答が届きませんでした。記録済みの可能性があるため、同じ受付番号で再確認します。'));
      }, 25000);
      const fail = error => { clearTimeout(timer); reject(error); };
      const accept = result => {
          clearTimeout(timer);
          if (result?.success === false) { reject(new Error(result.error || '記録できませんでした。')); return; }
          const prize = result?.prize;
          if (result?.protocol !== 3 || result.id !== id || result.receiptId !== id ||
              !Number.isInteger(result.index) || result.index < 0 || result.index > 4 ||
              prize?.rank !== result.index + 1 || typeof prize.title !== 'string' || !prize.title ||
              typeof prize.description !== 'string' || !Number.isFinite(Date.parse(result.drawnAt))) {
            reject(new Error('抽選結果を確認できません。同じ受付番号で再確認してください。'));
            return;
          }
          confirmed.add(game + ':' + id);
          resolve(result);
      };
      const input = { game, id, protocol: 3, campaignId: window.DrawRuntime.campaignId };
      try {
        if (window.DrawRuntime.transport === 'fetch') {
          fetch(window.DrawRuntime.endpoint, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(input), credentials: 'omit', redirect: 'follow', signal: controller.signal
          }).then(response => {
            if (!response.ok) throw new Error('記録先に接続できませんでした。');
            return response.json();
          }).then(accept).catch(() => fail(new Error('記録の応答を確認できません。同じ受付番号で再確認してください。')));
          return;
        }
        window.google.script.run.withSuccessHandler(accept).withFailureHandler(fail).drawPrize(input);
      } catch (error) { fail(error); }
    });
  }

  function finish(container, game, id) {
    container.hidden = !id;
    container.textContent = id ? `受付番号：${id}` : '';
    if (id && window.DrawRuntime?.testMode && confirmed.has(game + ':' + id)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'もう一度抽選する（テスト）';
      button.style.cssText = 'display:block;min-height:44px;margin:14px auto 0;padding:10px 18px;border:0;border-radius:10px;background:#526657;color:#fff;font:inherit;cursor:pointer';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          if (!await restart(game, id)) throw new Error('別の画面で参加状態が変わりました。');
          location.reload();
        } catch (_) {
          button.textContent = '再抽選を開始できません。画面を更新してください。';
        }
      });
      container.append(button);
    }
    if (window.DrawRuntime?.protocol === 3) return; // 完了後も参加IDを保持して再送・複数タブを同じ結果へまとめる。
    if (id && pending.get(game) === id) {
      pending.delete(game);
      try { sessionStorage.removeItem(`draw-pending-v2:${game}`); } catch (_) { /* No persisted attempt exists. */ }
    }
  }

  function render(rank, title, detail, prize) {
    rank.hidden = !prize.rank;
    rank.textContent = prize.rank ? `${prize.rank}等` : '';
    title.textContent = prize.title;
    detail.hidden = !prize.description;
    detail.textContent = prize.description;
  }

  window.DrawLog = { choose, finish, render, newId, restart };
})();

