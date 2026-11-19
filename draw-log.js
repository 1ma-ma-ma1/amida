globalThis.DrawPrizes = [
  {"rank":1,"title":"10分延長","description":"（1320円引き）"},
  {"rank":2,"title":"オプション半額","description":""},
  {"rank":3,"title":"温活無料","description":""},
  {"rank":4,"title":"温活無料","description":""},
  {"rank":5,"title":"スタンプ+1","description":""}
];
if (window.DrawRuntime?.protocol === 3) globalThis.DrawPrizes = window.DrawRuntime.prizes;

(() => {
  'use strict';
  const prefixes = { amida: 'AM-', roulette: 'RL-', egg: 'EG-', kuji: 'KJ-' };
  const recorded = window.DrawRecording === true;
  const pending = new Map();

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
      if (!stableId) {
        if (!prefixes[game]) throw new Error('抽選方法が不正です。');
        const key = 'gas-v3:' + window.DrawRuntime.namespace + ':' + window.DrawRuntime.campaignId + ':' + game;
        const attempt = await DrawStore.claim(key, { id: newId(game) });
        stableId = attempt.record.id;
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
      const timer = setTimeout(() => reject(new Error('応答が届きませんでした。記録済みの可能性があるため、同じ受付番号で再確認します。')), 25000);
      const fail = error => { clearTimeout(timer); reject(error); };
      try {
        window.google.script.run.withSuccessHandler(result => {
          clearTimeout(timer);
          const prize = result?.prize;
          if (result?.protocol !== 3 || result.id !== id || result.receiptId !== id ||
              !Number.isInteger(result.index) || result.index < 0 || result.index > 4 ||
              prize?.rank !== result.index + 1 || typeof prize.title !== 'string' || !prize.title ||
              typeof prize.description !== 'string' || !Number.isFinite(Date.parse(result.drawnAt))) {
            reject(new Error('抽選結果を確認できません。同じ受付番号で再確認してください。'));
            return;
          }
          resolve(result);
        }).withFailureHandler(fail).drawPrize({ game, id, protocol: 3, campaignId: window.DrawRuntime.campaignId });
      } catch (error) { fail(error); }
    });
  }

  function finish(container, game, id) {
    container.hidden = !id;
    container.textContent = id ? `受付番号：${id}` : '';
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

  window.DrawLog = { choose, finish, render, newId };
})();

