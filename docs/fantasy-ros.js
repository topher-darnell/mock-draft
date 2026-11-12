// Big Head GM: rest-of-season fantasy rankings with matchups and playoff schedules.
// Numbers come from the JSON that build_pages.py puts in the page (fantasy.rest_of_season()).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const D = JSON.parse($("rs-data").textContent);
  const TEAM = { ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears",
    CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans",
    IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins",
    MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers",
    SF: "49ers", SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let fmt = "ppr", pos = "All", by = "ros", showOut = false, limit = 60;
  try { fmt = localStorage.getItem("bhg-ff-format") || fmt; } catch (e) { /* private window */ }
  if (!["std", "half", "ppr", "tep"].includes(fmt)) fmt = "ppr";

  // matchup number -> color class
  const grade = (m) => (!m ? "bye" : m >= 1.1 ? "g2" : m >= 1.04 ? "g1" : m > 0.96 ? "n" : m > 0.9 ? "r1" : "r2");
  const word = { g2: "Easy", g1: "Good", n: "Average", r1: "Tough", r2: "Very tough", bye: "Bye" };

  // plain-English injury tag
  function injLabel(p) {
    const i = p.inj;
    if (!i) return "";
    const what = i.inj ? ` (${i.inj.split(" (")[0].toLowerCase()})` : "";
    if (i.s === "season") return `Out for the season${what}`;
    if (i.s === "ir") return `On IR${what}` + (i.back && i.back < 99 ? `, back about Week ${i.back}` : "");
    if (i.s === "out") return `Out${what}` + (i.back ? ` until Week ${i.back}` : "");
    if (i.s === "doubtful") return `Doubtful this week${what}`;
    return `Questionable this week${what}`;
  }

  // projected points over some weeks: points per game x matchup x chance he plays x QB change
  const pts = (p, keep) => p.sched.reduce((s, [w, , m, a, q]) => s + (keep(w) ? p.ppg[fmt] * m * a * q : 0), 0);
  const SORTS = {
    ros: { head: "Proj", title: `Projected fantasy points, Weeks ${D.from}–${D.to}`, val: (p) => p.ros[fmt] },
    po: { head: "Wk 15–17", title: `Projected fantasy points in the fantasy playoffs, Weeks ${D.playoffs.join(", ")}`, val: (p) => pts(p, (w) => D.playoffs.includes(w)) },
    week: { head: `Wk ${D.from}`, title: `Projected fantasy points, Week ${D.from}`, val: (p) => pts(p, (w) => w === D.from), dec: 1 },
    ppg: { head: "Proj", title: `Projected fantasy points, Weeks ${D.from}–${D.to}`, val: (p) => p.ros[fmt] },
  };

  function rankings() {
    // hidden unless turned on: out for the season, or not playing lately with no injury news
    const gone = (p) => (p.inj && p.inj.s === "season") || (p.out && !p.inj);
    const rows = D.players.filter((p) => (pos === "All" || p.p === pos) && (showOut || !gone(p)))
      .map((p) => ({ ...p, v: SORTS[by].val(p) }))
      .sort((a, b) => by === "ppg" ? b.ppg[fmt] - a.ppg[fmt] || b.v - a.v : b.v - a.v || b.ppg[fmt] - a.ppg[fmt]);
    const h = $("rs-proj-h");
    h.textContent = SORTS[by].head; h.title = SORTS[by].title;
    const posRank = {};
    $("rs-body").innerHTML = rows.slice(0, limit).map((p, i) => {
      posRank[p.p] = (posRank[p.p] || 0) + 1;
      const cells = p.sched.map(([w, opp, m, a]) => {   // m = matchup only; the QB change is in the projection
        const po = D.playoffs.includes(w) ? " po" : "";
        if (opp && a === 0) return `<td class="rs-m inj${po}" title="Week ${w}: expected to miss (injury)">OUT</td>`;
        const g = grade(m);
        return `<td class="rs-m ${g}${po}" title="Week ${w}: ${opp ? "vs " + (TEAM[opp] || opp) + " · " + word[g] : "bye"}">${opp || "BYE"}</td>`;
      }).join("");
      const out = injLabel(p) ? `<span class="rs-out">${injLabel(p)}</span>` : p.out ? `<span class="rs-out">Hasn't played since Week ${p.out}</span>` : "";
      const qb = p.qb ? `<span class="rs-qb ${p.qb.m > 1 ? "up" : "down"}">New QB: ${esc(p.qb.name)}${p.qb.status === "expected" ? " (expected)" : ""} ${p.qb.m > 1 ? "↑" : "↓"}</span>` : "";
      return `<tr><td class="rs-rk">${i + 1}</td>` +
        `<th scope="row" class="rs-pl"><a href="fantasy/${p.slug}.html">${esc(p.n)}</a>` +
        `<span>${p.p}${pos === "All" ? "" : posRank[p.p]} · ${esc(TEAM[p.t] || p.t)}</span>${out}${qb}</th>` +
        `<td class="rs-proj">${p.v.toFixed(SORTS[by].dec || 0)}</td><td class="rs-ppg">${p.ppg[fmt].toFixed(1)}</td>${cells}</tr>`;
    }).join("") || `<tr><td colspan="12" class="ff-none">No players match.</td></tr>`;
    $("rs-more").hidden = rows.length <= limit;
    $("rs-more").textContent = `Show all ${rows.length} players`;
  }

  // Easiest Week 15-17 schedules by position: average matchup of each team's three playoff opponents
  function playoffs() {
    const out = [];
    for (const ps of ["QB", "RB", "WR", "TE"]) {
      const teams = Object.keys(D.sched).map((t) => {
        const opps = D.playoffs.map((w) => D.sched[t][String(w)] || "");
        const ms = opps.map((o) => (o ? D.fac[ps][o] || 1 : 0));
        const played = ms.filter(Boolean);
        return { t, opps, ms, avg: played.reduce((a, b) => a + b, 0) / Math.max(1, played.length) * (played.length / 3) };
      }).sort((a, b) => b.avg - a.avg).slice(0, 5);
      out.push(`<div class="rs-po-card"><h3>${ps}</h3><ol>${teams.map((x) =>
        `<li><b>${esc(TEAM[x.t] || x.t)}</b><span class="rs-po-opps">${x.opps.map((o, k) =>
          `<span class="rs-m ${grade(x.ms[k])}">${o || "BYE"}</span>`).join("")}</span></li>`).join("")}</ol></div>`);
    }
    $("rs-po").innerHTML = out.join("");
  }

  function mark(group, attr, value) {
    for (const b of document.querySelectorAll(`#${group} .filter`)) {
      const on = b.dataset[attr] === value;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function render() { mark("rs-fmt", "fmt", fmt); mark("rs-pos", "pos", pos); mark("rs-sort", "sort", by); rankings(); }

  $("rs-fmt").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fmt]"); if (!b) return;
    fmt = b.dataset.fmt;
    try { localStorage.setItem("bhg-ff-format", fmt); } catch (er) { /* private window */ }
    render();
  });
  $("rs-pos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pos]"); if (!b) return;
    pos = b.dataset.pos; limit = 60; render();
  });
  $("rs-sort").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    by = b.dataset.sort; limit = 60; render();
  });
  $("rs-out").addEventListener("change", (e) => { showOut = e.target.checked; render(); });
  $("rs-more").addEventListener("click", () => { limit = 1000; rankings(); });
  render();
  playoffs();
})();
