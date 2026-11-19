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

  // My Team: the player's saved roster (slugs), kept on this device only. Shared by every fantasy tool.
  const TEAM_KEY = "bhg-myteam", TEAM_MAX = 25;
  function team() {
    try { const t = JSON.parse(localStorage.getItem(TEAM_KEY)); return Array.isArray(t) ? t : []; } catch (e) { return []; }
  }
  function saveTeam(t) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(t.slice(0, TEAM_MAX))); } catch (e) { /* private window */ } }
  const onTeam = (slug) => team().includes(slug);
  function toggleTeam(slug) {
    const t = team();
    const i = t.indexOf(slug);
    if (i >= 0) t.splice(i, 1);
    else if (t.length < TEAM_MAX) t.push(slug);
    saveTeam(t);
    return i < 0;
  }

  // "Add to My Team" buttons on fantasy player pages
  function setUpTeamButtons() {
    for (const b of document.querySelectorAll("[data-mt]")) {
      const paint = () => {
        const on = onTeam(b.dataset.mt);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on);
        b.textContent = on ? "✓ On My Team" : "+ Add to My Team";
      };
      b.addEventListener("click", () => {
        const added = toggleTeam(b.dataset.mt);
        countEvent(added ? "my-team-add-page" : "my-team-remove-page", added ? "Added from a player page" : "Removed from a player page");
        paint();
        const note = b.parentElement.querySelector(".mt-note");
        if (note) note.hidden = !added;
      });
      paint();
    }
  }

  // news about your players gets a "Your player" tag
  function markNews() {
    const t = team();
    if (!t.length) return;
    for (const li of document.querySelectorAll(".nw-item[data-slug]")) {
      if (!t.includes(li.dataset.slug) || li.classList.contains("nw-mine")) continue;
      li.classList.add("nw-mine");
      li.querySelector(".nw-tag").insertAdjacentHTML("afterend", '<span class="nw-tag nw-you">Your player</span>');
    }
  }

  paintGMs();
  setUpBoard();
  setUpTeamButtons();
  markNews();
  window.BHG = { paintGMs, countEvent, ROOT, HAS_GM, team, saveTeam, toggleTeam, onTeam };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}); });
  }
})();
