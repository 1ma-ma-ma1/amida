// 店名はこのファイル、GAS版の特典は gas/Code.gs、試遊版の特典は draw-log.js で設定。
// 新GASでは記録モード、直接のGitHub Pagesでは試遊モード。
window.SALON_CONFIG = {
  salonName: "リラクゼーションサロン",
  demo: window.DrawRuntime?.protocol === 3 ? false : true,
  // 同じキャンペーンでは同じ値を維持。変更すると再参加できます。
  campaignId: window.DrawRuntime?.campaignId || "salon-amida-2026-01",
  benefits: window.DrawRuntime?.prizes || DrawPrizes
};

