(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.SALON_CONFIG;
  const choices = [...document.querySelectorAll(".choice")];
  const startButton = $("start");
  const dialog = $("result-dialog");
  let board, selected = null, state = "loading";
  choices.forEach(b => b.disabled = true);
  if (!config || typeof config.salonName !== "string" || typeof config.demo !== "boolean" || typeof config.campaignId !== "string" || !config.campaignId.trim() || !Array.isArray(config.benefits) || config.benefits.length !== 5 || config.benefits.some(b => !b || typeof b.title !== "string" || !b.title.trim() || typeof b.description !== "string")) {
    $("instruction").textContent = "設定を確認してください。特典は5つの名称と説明が必要です。";
    return;
  }
  const storageKey = `${config.demo ? "demo" : "live"}:${config.campaignId}`;
  $("salon-name").textContent = config.salonName;
  $("footer-name").textContent = config.salonName;
  document.title = `癒やしのあみだくじ | ${config.salonName}`;
  $("preview-badge").hidden = !config.demo;
  $("demo-note").textContent = config.demo ? "特典内容は準備中です。お試しでお楽しみください。" : "結果が出たら、スタッフに画面をお見せください。";

  function step(number) {
    for (let i = 1; i <= 3; i++) {
      const item = $(`step-${i}`);
      item.classList.toggle("current", i === number);
      if (i === number) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
  }
  function renderBoard() {
    $("lines").replaceChildren();
    const line = (x1, y1, x2, y2) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
      Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => element.setAttribute(key, value));
      $("lines").append(element);
    };
    for (let i = 0; i < 5; i++) line(50 + 100 * i, 0, 50 + 100 * i, 300);
    board.bridges.forEach(b => line(50 + 100 * b.col, b.y, 150 + 100 * b.col, b.y));
    $("trace").removeAttribute("d");
    $("trace").style.strokeDasharray = "none";
    $("trace").style.strokeDashoffset = "0";
    $("destinations").replaceChildren(...Array.from({ length: 5 }, (_, i) => {
      const cell = document.createElement("div");
      cell.className = "destination";
      cell.textContent = "✧";
      cell.setAttribute("aria-label", `到着地点${i + 1}：特典はお楽しみ`);
      return cell;
    }));
    choices.forEach(b => {
      const active = Number(b.dataset.index) === selected;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }
  function failClosed() {
    state = "error";
    choices.forEach(b => b.disabled = true);
    startButton.disabled = true;
    startButton.textContent = "抽選を開始できません";
    $("instruction").textContent = "参加記録を確認・保存できません。通常のブラウザで開き直すか、スタッフへお声がけください。";
  }
  async function showRecord(record, animate = false, openDialog = true) {
    if (!record || record.version !== 1 || !record.board || !Array.isArray(record.board.bridges) || !Number.isInteger(record.selected) || record.selected < 0 || record.selected > 4 || typeof record.benefit?.title !== "string" || typeof record.benefit?.description !== "string") throw new Error("Invalid saved result");
    state = "running";
    board = record.board;
    selected = record.selected;
    renderBoard();
    choices.forEach(b => b.disabled = true);
    const result = Amida.route(selected, board.bridges);
    const trace = $("trace");
    trace.setAttribute("d", result.path);
    if (animate) {
      step(2);
      const length = trace.getTotalLength();
      trace.style.strokeDasharray = String(length);
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2400;
      if (duration && typeof trace.animate === "function") {
        const animation = trace.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration, easing: "linear", fill: "forwards" });
        try { await animation.finished; } catch (_) { /* Saved result remains authoritative. */ }
        animation.cancel();
      }
    }
    trace.style.strokeDashoffset = "0";
    const benefit = record.benefit;
    const destination = $("destinations").children[result.end];
    destination.classList.add("won");
    destination.textContent = benefit.title;
    destination.setAttribute("aria-label", `結果：${benefit.title}`);
    $("result-title").textContent = benefit.title;
    $("result-description").textContent = benefit.description;
    $("result-date").textContent = `抽選日：${new Date(record.drawnAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;
    $("result-disclaimer").textContent = config.demo ? "現在はお試し版です。実際の特典内容は後日ご案内します。" : "この画面をスタッフにお見せください。";
    $("instruction").textContent = `参加済みです。あなたの結果は「${benefit.title}」。`;
    state = "complete";
    step(3);
    startButton.textContent = "獲得済みの結果をみる →";
    startButton.disabled = false;
    if (openDialog && !dialog.open) dialog.showModal();
  }
  choices.forEach(button => button.addEventListener("click", () => {
    if (state !== "choosing") return;
    selected = Number(button.dataset.index);
    choices.forEach(b => { const active = b === button; b.classList.toggle("selected", active); b.setAttribute("aria-pressed", String(active)); });
    $("instruction").textContent = `${selected + 1}番を選びました。くじを引けるのは1回です。`;
    startButton.textContent = "この数字で、くじを引く →";
    startButton.disabled = false;
  }));
  startButton.addEventListener("click", async () => {
    if (state === "complete") { if (!dialog.open) dialog.showModal(); return; }
    if (state !== "choosing" || selected === null) return;
    state = "saving";
    choices.forEach(b => b.disabled = true);
    startButton.disabled = true;
    startButton.textContent = "あなたへの贈りものを探しています…";
    $("instruction").textContent = "線の先には、どんなご褒美が待っているでしょう。";
    try {
      const result = Amida.route(selected, board.bridges);
      const candidate = { version: 1, board, selected, benefit: { ...config.benefits[board.prizes[result.end]] }, drawnAt: new Date().toISOString() };
      // Commit BEFORE animation: reloading mid-animation restores the same result.
      const claim = await DrawStore.claim(storageKey, candidate);
      await showRecord(claim.record, claim.fresh);
    } catch (_) { failClosed(); }
  });
  $("close-result").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => startButton.focus());
  async function init() {
    try {
      $("instruction").textContent = "参加記録を確認しています…";
      const record = await DrawStore.read(storageKey);
      if (record) { await showRecord(record); return; }
      board = Amida.createBoard();
      renderBoard();
      state = "choosing";
      choices.forEach(b => b.disabled = false);
      $("instruction").textContent = "お好きな数字をひとつ選んでください";
    } catch (_) { failClosed(); }
  }
  async function sync() {
    if (state !== "choosing") return;
    try {
      const record = await DrawStore.read(storageKey);
      if (record && state === "choosing") await showRecord(record, false, false);
    } catch (_) { failClosed(); }
  }
  window.addEventListener("focus", sync);
  window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  init();
})();
