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
  try { fmt = localStorage.getItem(KEY) || fmt; } catch (e) { /* private window */ }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v) => (Math.round(v * 10) / 10).toFixed(1);

  function leaders() {
    const rows = DATA.leaders.filter((r) => pos === "All" || r.p === pos).sort((a, b) => b.s[fmt] - a.s[fmt]).slice(0, 50);
    document.getElementById("ff-lead").innerHTML = rows.map((r, i) =>
      `<tr><td class="ff-rk">${i + 1}</td><th scope="row">${esc(r.n)}<span>${r.p} · ${esc(TEAM[r.t] || r.t)} · ${esc(r.line)}</span></th>` +
      `<td>${r.g}</td><td><b>${num(r.s[fmt])}</b></td><td>${num(r.s[fmt] / r.g)}</td></tr>`).join("");
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
  }

  for (const b of document.querySelectorAll("#ff-fmt .filter")) {
    b.addEventListener("click", () => {
      fmt = b.dataset.fmt;
      try { localStorage.setItem(KEY, fmt); } catch (e) { /* private window */ }
      render();
    });
  }
  for (const b of document.querySelectorAll("#ff-pos .filter")) {
    b.addEventListener("click", () => { pos = b.dataset.pos; render(); });
  }
  // the three tabs: show one list at a time (without this script, all three show)
  const TABS = ["leaders", "next-year", "dynasty"];
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
  if (fmt !== "ppr") render();
})();
