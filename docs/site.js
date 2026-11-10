// Big Head GM: small shared script for the read-only pages (players, teams, odds, games).
// Puts the GM photos in, runs the big board's search and filters, and keeps the site working offline.

(function () {
  const HAS_GM = typeof GM !== "undefined";
  const ROOT = (document.currentScript && document.currentScript.src || "").replace(/site\.js.*$/, "");

  // every <span data-gm="Team"> becomes that team's GM on a tile in the team color
  function paintGMs(scope) {
    if (!HAS_GM) return;
    for (const box of (scope || document).querySelectorAll("[data-gm]:empty")) {
      const team = box.dataset.gm;
      box.style.background = GM.tint(team);
      box.innerHTML = GM.img(team, box.dataset.mood || "neutral", Number(box.dataset.size) || 44);
    }
  }

  // count something in GoatCounter (a game played, a result shared)
  function countEvent(path, title) {
    try {
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true });
    } catch (e) { /* never let the counter break the page */ }
  }

  // the big board: position chips, a search box, and #WR style links
  function setUpBoard() {
    const list = document.getElementById("bb-list");
    if (!list) return;
    const rows = [...list.children];
    const chips = [...document.querySelectorAll("#bb-chips .filter")];
    const search = document.getElementById("bb-search");
    let pos = "All";

    function apply() {
      const words = search.value.trim().toLowerCase();
      let shown = 0;
      for (const row of rows) {
        const ok = (pos === "All" || row.dataset.pos === pos) && (!words || row.dataset.find.includes(words));
        row.hidden = !ok;
        if (ok) shown++;
      }
      for (const c of chips) {
        const on = c.dataset.pos === pos;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      }
      document.getElementById("bb-count").textContent = `${shown} prospect${shown === 1 ? "" : "s"}`;
      document.getElementById("bb-none").hidden = shown > 0;
    }
    function fromHash() {
      const want = decodeURIComponent(location.hash.replace("#", "")).toUpperCase();
      pos = chips.some((c) => c.dataset.pos === want) ? want : "All";
      apply();
    }
    for (const c of chips) {
      c.addEventListener("click", () => {
        pos = c.dataset.pos;
        history.replaceState(null, "", pos === "All" ? location.pathname : `#${pos}`);
        apply();
      });
    }
    search.addEventListener("input", apply);
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  paintGMs();
  setUpBoard();
  window.BHG = { paintGMs, countEvent, ROOT, HAS_GM };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}); });
  }
})();
