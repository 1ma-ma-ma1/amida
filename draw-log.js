(() => {
  'use strict';
  const enabled = () => typeof window.google?.script?.run?.withSuccessHandler === 'function';

  function id(game) {
    if (!enabled()) return null;
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const suffix = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return (game === 'amida' ? 'AM-' : 'RL-') + suffix;
  }

  function show(container, game, managementId, prize, onSaved) {
    if (!enabled() || !managementId || container.dataset.recordId === managementId) return false;
    container.dataset.recordId = managementId;
    container.hidden = false;
    const number = document.createElement('p');
    number.textContent = '管理番号：' + managementId;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '記録を再試行';
    retry.hidden = true;
    container.replaceChildren(number, status, retry);

    function submit() {
      retry.hidden = true;
      status.textContent = '集計表へ記録中…';
      function fail() {
        status.textContent = '記録を確認できません。管理番号を残したまま再試行できます。';
        retry.hidden = false;
      }
      try {
        window.google.script.run.withSuccessHandler(response => {
          if (response?.id !== managementId) { fail(); return; }
          status.textContent = '集計表に記録しました。';
          onSaved();
        }).withFailureHandler(fail).recordDraw({ game, id: managementId, prize });
      } catch (_) {
        fail();
      }
    }

    retry.addEventListener('click', submit);
    submit();
    return true;
  }

  window.DrawLog = { id, show };
})();
