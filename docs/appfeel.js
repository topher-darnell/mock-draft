// Big Head GM: small touches that make the site feel like an app on phones.
// Pull down to refresh (in the iPhone app and the home-screen app), faster page opens, and a short
// fade between pages. Nothing here is needed for the site to work.
(function () {
  "use strict";
  const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (inApp) document.documentElement.classList.add("in-app");

  // ---------- open pages faster: start loading a page as soon as a finger touches its link ----------
  const fetched = new Set();
  function prefetch(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.origin !== location.origin || a.hasAttribute("download")) return;
    const url = a.href.split("#")[0];
    if (url === location.href.split("#")[0] || fetched.has(url) || fetched.size > 30) return;
    fetched.add(url);
    const l = document.createElement("link");
    l.rel = "prefetch"; l.href = url;
    document.head.appendChild(l);
  }
  document.addEventListener("touchstart", prefetch, { passive: true, capture: true });
  document.addEventListener("mouseover", prefetch, { passive: true, capture: true });

  // ---------- pull down to refresh (the app has no reload button) ----------
  if (!inApp || !("ontouchstart" in window)) return;
  const PULL = 70, MAX = 110;
  let y0 = null, dy = 0, busy = false;
  const ring = document.createElement("div");
  ring.className = "ptr";
  ring.setAttribute("aria-hidden", "true");
  ring.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  document.body.appendChild(ring);

  // don't fight things that scroll or drag on their own (draft board, sheets, games)
  const busyArea = (t) => t.closest && t.closest("input, textarea, select, [data-no-ptr], .gm-shell, #draft-screen, .fd-board, .od-wrap, .mt-chips");
  const atTop = () => (window.scrollY || document.documentElement.scrollTop) <= 0;

  function show(d) {
    const k = Math.min(d, MAX);
    ring.style.transform = `translate(-50%, ${k - 50}px) rotate(${k * 3}deg)`;
    ring.style.opacity = Math.min(1, k / PULL);
    ring.classList.toggle("ready", k >= PULL);
  }
  function reset() {
    ring.classList.add("back");
    ring.style.transform = "translate(-50%, -50px)";
    ring.style.opacity = 0;
    setTimeout(() => ring.classList.remove("back", "ready"), 250);
  }
  document.addEventListener("touchstart", (e) => {
    if (busy || e.touches.length !== 1 || !atTop() || busyArea(e.target) || document.body.classList.contains("no-ptr")) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = (e.touches[0].clientY - y0) * 0.5;          // the ring moves at half the finger's speed
    if (dy <= 0 || !atTop()) { if (dy < 0) y0 = null; show(0); return; }
    show(dy);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (y0 == null) return;
    y0 = null;
    if (dy >= PULL) {
      busy = true;
      ring.classList.add("spin");
      try { window.BHG && BHG.countEvent("pull-to-refresh", "Pulled to refresh"); } catch (e) { /* ignore */ }
      setTimeout(() => location.reload(), 250);
    } else reset();
  }, { passive: true });
})();
