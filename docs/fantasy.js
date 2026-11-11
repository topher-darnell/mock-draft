// Big Head GM: the Fantasy page. The scoring buttons re-rank the leaders and both rookie lists;
// the position buttons filter the leaders. The numbers come from the JSON that build_pages.py puts in the page.

(function () {
  const box = document.getElementById("ff-data");
  if (!box) return;
  const DATA = JSON.parse(box.textContent);
  const TEAM = { ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears",
    CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans",
    IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins",
    MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers",
    SF: "49ers", SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders" };
  const KEY = "bhg-ff-format";
  let fmt = "ppr";
  let pos = "All";
  let all = false;           // "Show all players" pressed
  let words = "";            // the search box
  let team = "";             // the team dropdown ("" = all teams)
  try { fmt = localStorage.getItem(KEY) || fmt; } catch (e) { /* private window */ }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v) => (Math.round(v * 10) / 10).toFixed(1);

  function leaders() {
    const ranked = DATA.leaders.filter((r) => pos === "All" || r.p === pos).sort((a, b) => b.s[fmt] - a.s[fmt]);
    let rows = ranked.map((r, i) => [r, i + 1]);
    if (team) {
      const ORDER = ["QB", "RB", "WR", "TE"];
      rows = rows.filter(([r]) => r.t === team)
        .sort((x, y) => ORDER.indexOf(x[0].p) - ORDER.indexOf(y[0].p) || x[1] - y[1]);
    }
    if (words) rows = rows.filter(([r]) => r.n.toLowerCase().includes(words) || (TEAM[r.t] || "").toLowerCase().includes(words));
    const more = document.getElementById("ff-more");
    more.hidden = all || words || team || rows.length <= 50;
    more.textContent = `Show all ${rows.length} players`;
    if (!all && !words && !team) rows = rows.slice(0, 50);
    document.getElementById("ff-lead").innerHTML = rows.length ? rows.map(([r, i]) =>
      `<tr><td class="ff-rk">${i}</td><th scope="row"><a href="fantasy/${r.slug}.html">${esc(r.n)}</a><span>${r.p} · ${esc(TEAM[r.t] || r.t)} · ${esc(r.line)}</span></th>` +
      `<td>${r.g}</td><td><b>${num(r.s[fmt])}</b></td><td>${num(r.s[fmt] / r.g)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="ff-none">No player matches those filters.</td></tr>`;
  }

  function rookies(id, key) {
    const list = document.getElementById(id);
    const rows = DATA.rookies.slice().sort((a, b) => b[key][fmt] - a[key][fmt]).slice(0, 25);
    list.innerHTML = rows.map((r, i) => {
      const name = r.slug ? `<a href="players/${r.slug}.html">${esc(r.n)}</a>` : esc(r.n);
      const age = r.age ? ` · age ${r.age}` : "";
      const why = r.why ? ` · ${esc(r.why)}` : "";
      return `<li class="ff-rook"><span class="bb-rank">${i + 1}</span>` +
        `<span class="avatar" data-gm="${esc(r.team)}" data-mood="happy" data-size="40"></span>` +
        `<span class="bb-text"><b class="ff-rname">${name}</b>` +
        `<span class="bb-meta">${r.p} · ${esc(r.c)}${age}${why}</span>` +
        `<span class="bb-meta">Projected pick #${r.pick} · most often to the ${esc(r.short)} (${r.tp}%)</span></span></li>`;
    }).join("");
    if (window.BHG) window.BHG.paintGMs(list);
  }

  // Trending: last few weeks vs. before, per game
  let tpos = "All";
  function trending() {
    const T = DATA.trends;
    const up = document.getElementById("tr-up"), down = document.getElementById("tr-down");
    if (!up) return;
    if (!T || !T.ready) { up.closest(".tr-cols").hidden = true; document.getElementById("tr-pos").hidden = true; return; }
    const span = T.from === T.to ? `Week ${T.to}` : `Weeks ${T.from}–${T.to}`;
    const scale = { std: 0.75, half: 0.88, ppr: 1, tep: 1 }[fmt];        // thresholds are in PPR points
    const pool = T.players.filter((r) => tpos === "All" || r.p === tpos);
    const line = (r) => {
      const bits = [`${num(r.now[fmt])} PPG in ${span}` + (r.g0 ? ` (was ${num(r.was[fmt])})` : " (first games)")];
      if (r.p === "RB") bits.push(`${num(r.car[1])} carries a game (was ${num(r.car[0])})`);
      if (r.p !== "QB" && (r.tgt[1] >= 2 || r.tgt[0] >= 2)) bits.push(`${num(r.tgt[1])} targets a game (was ${num(r.tgt[0])})`);
      if ((r.p === "WR" || r.p === "TE") && r.share[1] >= 10) bits.push(`${r.share[1]}% of team targets`);
      return bits.join(" · ");
    };
    const item = (r, dir) => {
      const d = r.now[fmt] - r.was[fmt];
      const touches = (i) => r.tgt[i] + (r.p === "RB" ? r.car[i] : 0);
      const tag = dir === "up" && r.p !== "QB" && (r.was[fmt] < 6 * scale || touches(1) - touches(0) >= 5) ? '<span class="tr-tag">Bigger role</span>' : "";
      return `<li class="tr-item ${dir}"><span class="tr-delta">${dir === "up" ? "+" : "−"}${num(Math.abs(d))}</span>` +
        `<span class="tr-text"><span class="tr-name"><a href="fantasy/${r.slug}.html">${esc(r.n)}</a> ${tag}</span>` +
        `<span class="tr-meta">${r.p} · ${esc(TEAM[r.t] || r.t)}</span><span class="tr-meta">${line(r)}</span></span></li>`;
    };
    // at least 2 earlier games and 2 recent ones, so one injury exit, a backup filling in or a player back from injury isn't a "trend"
    const risers = pool.filter((r) => r.g0 >= 2 && r.gw >= Math.min(2, T.to - T.from + 1) && r.now[fmt] >= 8 * scale && r.now[fmt] - r.was[fmt] >= 3 * scale)
      .sort((a, b) => (b.now[fmt] - b.was[fmt]) - (a.now[fmt] - a.was[fmt])).slice(0, 15);
    const fallers = pool.filter((r) => r.g0 >= 2 && r.gw >= Math.min(2, T.to - T.from + 1) && r.was[fmt] >= 10 * scale && r.was[fmt] - r.now[fmt] >= 3 * scale)
      .sort((a, b) => (a.now[fmt] - a.was[fmt]) - (b.now[fmt] - b.was[fmt])).slice(0, 10);
    up.innerHTML = risers.map((r) => item(r, "up")).join("") || '<li class="ff-none">Nobody new is heating up at this position.</li>';
    down.innerHTML = fallers.map((r) => item(r, "down")).join("") || '<li class="ff-none">Nobody is cooling off at this position.</li>';
  }

  function mark(group, attr, value) {
    for (const b of document.querySelectorAll(`#${group} .filter`)) {
      const on = b.dataset[attr] === value;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function render() {
    mark("ff-fmt", "fmt", fmt);
    mark("ff-pos", "pos", pos);
    leaders();
    rookies("ff-y1", "y1");
    rookies("ff-dyn", "dyn");
    mark("tr-pos", "tpos", tpos);
    trending();
  }
  for (const b of document.querySelectorAll("#tr-pos .filter")) {
    b.addEventListener("click", () => { tpos = b.dataset.tpos; render(); });
  }

  for (const b of document.querySelectorAll("#ff-fmt .filter")) {
    b.addEventListener("click", () => {
      fmt = b.dataset.fmt;
      try { localStorage.setItem(KEY, fmt); } catch (e) { /* private window */ }
      render();
    });
  }
  for (const b of document.querySelectorAll("#ff-pos .filter")) {
    b.addEventListener("click", () => { pos = b.dataset.pos; all = false; render(); });
  }
  document.getElementById("ff-more").addEventListener("click", () => { all = true; leaders(); });
  document.getElementById("ff-team").addEventListener("change", (e) => { team = e.target.value; leaders(); });
  document.getElementById("ff-search").addEventListener("input", (e) => { words = e.target.value.trim().toLowerCase(); leaders(); });
  // the three tabs: show one list at a time (without this script, all three show)
  const TABS = ["leaders", "trending", "next-year", "dynasty"];
  function showTab(id, push) {
    if (!TABS.includes(id)) id = "leaders";
    for (const t of TABS) document.getElementById(t).hidden = t !== id;
    for (const a of document.querySelectorAll("#ff-tabs a")) {
      const on = a.dataset.tab === id;
      a.classList.toggle("active", on);
      a.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (push) history.replaceState(null, "", id === "leaders" ? location.pathname : "#" + id);
  }
  for (const a of document.querySelectorAll("#ff-tabs a")) {
    a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.tab, true); });
  }
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));

  if (!["std", "half", "ppr", "tep"].includes(fmt)) fmt = "ppr";
  const want = new URLSearchParams(location.search).get("team");
  if (want && TEAM[want]) {
    team = want;
    document.getElementById("ff-team").value = want;
  }
  render();
})();
