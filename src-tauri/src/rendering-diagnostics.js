// Only injected when CASCADE_RENDER_DIAGNOSTICS is set. No project data is read.
(() => {
  if (window.__cascadeFrameTiming) return;
  window.__cascadeFrameTiming = true;
  let previous = 0;
  let start = 0;
  let intervals = [];
  let rafCallbacks = 0;
  let rafWorkMs = 0;
  let longestCallbackMs = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRaf((timestamp) => {
    const before = performance.now();
    try {
      callback(timestamp);
    } finally {
      const elapsed = performance.now() - before;
      rafCallbacks++;
      rafWorkMs += elapsed;
      longestCallbackMs = Math.max(longestCallbackMs, elapsed);
    }
  });
  const emit = (payload) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
    event: "cascade://frame-timing",
    payload,
  }).catch(() => {});
  const frame = (now) => {
    if (document.visibilityState !== "visible") {
      previous = start = 0;
      intervals = [];
    } else {
      if (!start) start = now;
      if (previous) intervals.push(now - previous);
      previous = now;
      if (now - start >= 1000 && intervals.length) {
        const sorted = [...intervals].sort((a, b) => a - b);
        emit({
          fps: Math.round(intervals.length * 1000 / (now - start)),
          medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
          p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2),
          over50Ms: intervals.filter((ms) => ms > 50).length,
          size: [innerWidth, innerHeight, devicePixelRatio],
          rafCallbacks,
          rafWorkMs: +rafWorkMs.toFixed(2),
          longestCallbackMs: +longestCallbackMs.toFixed(2),
          effects: document.documentElement.dataset.performance || "off",
          scene: document.querySelector("[data-menu-guard]") ? "menu" : document.querySelector(".editor-main") ? "editor" : "other",
          animations: document.getAnimations().length,
        });
        rafCallbacks = rafWorkMs = longestCallbackMs = 0;
        start = now;
        intervals = [];
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
