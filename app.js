(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.SALON_CONFIG;
  const characters = [
    ["リーフィ", "leaf"], ["モコ", "cloud"], ["コロン", "nut"],
    ["ルル", "petal"], ["しずく", "dew"]
  ];
  const rewards = [
    ["star", "きらめき"], ["chest", "宝箱"], ["coin", "コイン"],
    ["ticket", "クーポン"], ["candy", "キャンディ"]
  ];
  function rewardArt(column, decorative = false) {
    const [shape, label] = rewards[(board.icons || board.prizes)[column]];
    const art = document.createElement("span");
    art.className = "reward-art reward-art--" + shape;
    art.append(document.createElement("i"));
    if (decorative) art.setAttribute("aria-hidden", "true");
    else {
      art.setAttribute("role", "img");
      art.setAttribute("aria-label", label);
    }
    return art;
  }
  const walker = $("walker");
  function mascot(shape) {
    const avatar = document.createElement("span");
    avatar.className = "mascot mascot--" + shape;
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = '<span class="mascot-feet"></span><span class="mascot-body"><span class="mascot-face"></span></span>';
    return avatar;
  }
  const choices = characters.map(([name, shape], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.index = index;
    button.setAttribute("aria-label", (index + 1) + "番の" + name + "を選ぶ");
    const caption = document.createElement("span");
    caption.className = "character-name";
    caption.textContent = (index + 1) + " · " + name;
    button.append(mascot(shape), caption);
    return button;
  });
  document.querySelector(".choices").append(...choices);
  const startButton = $("start");
  const dialog = $("result-dialog");
  let board, selected = null, completedDraw = null, state = "loading";
  choices.forEach(b => b.disabled = true);
  if (!config || typeof config.salonName !== "string" || typeof config.demo !== "boolean" || typeof config.campaignId !== "string" || !config.campaignId.trim() || !Array.isArray(config.benefits) || config.benefits.length !== 5 || config.benefits.some(b => !b || typeof b.title !== "string" || !b.title.trim() || typeof b.description !== "string")) {
    $("instruction").textContent = "設定を確認してください。特典は5つの名称と説明が必要です。";
    return;
  }
  const storageKey = "live:" + config.campaignId;
  $("participation-note").textContent = config.demo ? "テスト期間中は何度でも引き直せます。" : "参加はこのブラウザで1回限り。再アクセスで結果を確認できます。";
  $("retry").hidden = !config.demo;
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
    walker.hidden = true;
    $("trace").removeAttribute("d");
    $("trace").style.strokeDasharray = "none";
    $("trace").style.strokeDashoffset = "0";
    $("destinations").replaceChildren(...Array.from({ length: 5 }, (_, i) => {
      const cell = document.createElement("div");
      cell.className = "destination";
      cell.setAttribute("role", "listitem");
      cell.append(rewardArt(i));
      return cell;
    }));
    choices.forEach(b => {
      const active = Number(b.dataset.index) === selected;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }
  function newDraw(focus = false) {
    board = Amida.createBoard();
    selected = null;
    completedDraw = null;
    state = "choosing";
    renderBoard();
    step(1);
    choices.forEach(button => button.disabled = false);
    $("instruction").textContent = "お好きなキャラクターを選んでください";
    startButton.textContent = "キャラクターを選んでください →";
    startButton.disabled = true;
    if (focus) choices[0].focus();
  }

  async function animateRoute(trace, shape) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const length = trace.getTotalLength();
    const moves = [
      { gait: "walk", share: 0.24, duration: 890 },
      { gait: "run", share: 0.31, duration: 550 },
      { gait: "jump", share: 0.16, duration: 600 },
      { gait: "walk", share: 0.29, duration: 1000 }
    ];
    if (Math.random() < 0.5) [moves[1], moves[2]] = [moves[2], moves[1]];
    const offset = (Math.random() - 0.5) * 0.12;
    moves[0].share += offset;
    moves[3].share -= offset;
    walker.replaceChildren(mascot(shape));
    walker.hidden = false;
    trace.style.strokeDasharray = String(length);
    function place(distance) {
      const point = trace.getPointAtLength(distance);
      walker.style.left = (point.x / 5) + "%";
      walker.style.top = (point.y / 3) + "%";
      trace.style.strokeDashoffset = String(length - distance);
    }
    let distance = 0;
    place(distance);
    for (const move of moves) {
      walker.dataset.motion = move.gait;
      await new Promise(resolve => {
        let firstFrame;
        function frame(now) {
          firstFrame ??= now;
          const progress = Math.min(1, (now - firstFrame) / move.duration);
          place(distance + length * move.share * progress);
          if (progress < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
      distance += length * move.share;
    }
    place(length);
    delete walker.dataset.motion;
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
      await animateRoute(trace, characters[selected][1]);
    }
    trace.style.strokeDashoffset = "0";
    const benefit = record.benefit;
    const destination = $("destinations").children[result.end];
    destination.classList.add("won");
    completedDraw = {
      end: result.end,
      titles: Array.isArray(record.goalTitles) && record.goalTitles.length === 5
        ? record.goalTitles.slice() : board.prizes.map(prize => config.benefits[prize].title)
    };
    completedDraw.titles[result.end] = benefit.title;
    $("result-icon").replaceChildren(rewardArt(result.end, true));
    $("result-title").textContent = benefit.title;
    $("result-description").textContent = benefit.description;
    const retry = $("retry");
    if (record.managementId && $("draw-log").dataset.recordId !== record.managementId) {
      retry.disabled = true;
      DrawLog.show($("draw-log"), "amida", record.managementId, benefit.title, () => { retry.disabled = false; });
    }
    $("result-date").textContent = `抽選日：${new Date(record.drawnAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;
    $("result-disclaimer").textContent = config.demo ? "現在はお試し版です。実際の特典内容は後日ご案内します。" : "この画面をスタッフにお見せください。";
    $("instruction").textContent = characters[selected][0] + "が「" + benefit.title + "」に到着しました。";
    state = "complete";
    step(3);
    startButton.textContent = "獲得済みの結果をみる →";
    startButton.disabled = false;
    if (openDialog && !dialog.open) {
      dialog.returnValue = "";
      dialog.showModal();
    }
  }
  choices.forEach(button => button.addEventListener("click", () => {
    if (state !== "choosing") return;
    selected = Number(button.dataset.index);
    choices.forEach(b => { const active = b === button; b.classList.toggle("selected", active); b.setAttribute("aria-pressed", String(active)); });
    $("instruction").textContent = characters[selected][0] + "を選びました。";
    startButton.textContent = "このキャラクターで、くじを引く →";
    startButton.disabled = false;
  }));
  startButton.addEventListener("click", async () => {
    if (state === "complete") {
      dialog.returnValue = "";
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (state !== "choosing" || selected === null) return;
    state = "saving";
    choices.forEach(b => b.disabled = true);
    startButton.disabled = true;
    startButton.textContent = "あなたへの贈りものを探しています…";
    $("instruction").textContent = "線の先には、どんなご褒美が待っているでしょう。";
    try {
      const result = Amida.route(selected, board.bridges);
      const candidate = {
        version: 1, board, selected,
        managementId: DrawLog.id("amida"),
        benefit: { ...config.benefits[board.prizes[result.end]] },
        goalTitles: board.prizes.map(prize => config.benefits[prize].title),
        drawnAt: new Date().toISOString()
      };
      // Live draws are saved before animation so a reload restores the same result.
      const claim = config.demo ? { record: candidate, fresh: true } : await DrawStore.claim(storageKey, candidate);
      await showRecord(claim.record, claim.fresh);
    } catch (_) { failClosed(); }
  });
  $("close-result").addEventListener("click", () => {
    if (!completedDraw) return;
    [...$("destinations").children].forEach((cell, column) => {
      const name = document.createElement("span");
      name.className = "goal-title";
      name.textContent = completedDraw.titles[column];
      cell.replaceChildren(rewardArt(column, true), name);
      if (column === completedDraw.end) {
        const badge = document.createElement("strong");
        badge.className = "goal-badge";
        badge.textContent = "当選";
        cell.append(badge);
      }
    });
    dialog.close("show-path");
    $("result-board").focus();
  });
  $("retry").addEventListener("click", () => {
    if (!config.demo || state !== "complete") return;
    dialog.close();
    newDraw(true);
  });
  dialog.addEventListener("close", () => {
    if (state === "complete" && dialog.returnValue !== "show-path") startButton.focus();
  });
  async function init() {
    try {
      if (config.demo) { newDraw(); return; }
      $("instruction").textContent = "参加記録を確認しています…";
      const record = await DrawStore.read(storageKey);
      if (record) { await showRecord(record); return; }
      newDraw();
    } catch (_) { failClosed(); }
  }
  async function sync() {
    if (config.demo || state !== "choosing") return;
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
