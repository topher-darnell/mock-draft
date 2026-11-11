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
  let fmt = "ppr", pos = "All", showOut = false, limit = 60;
  try { fmt = localStorage.getItem("bhg-ff-format") || fmt; } catch (e) { /* private window */ }
  if (!["std", "half", "ppr", "tep"].includes(fmt)) fmt = "ppr";

  // matchup number -> color class
  const grade = (m) => (!m ? "bye" : m >= 1.1 ? "g2" : m >= 1.04 ? "g1" : m > 0.96 ? "n" : m > 0.9 ? "r1" : "r2");
  const word = { g2: "Easy", g1: "Good", n: "Average", r1: "Tough", r2: "Very tough", bye: "Bye" };

  function rankings() {
    const rows = D.players.filter((p) => (pos === "All" || p.p === pos) && (showOut || !p.out))
      .sort((a, b) => b.ros[fmt] - a.ros[fmt]);
    const posRank = {};
    $("rs-body").innerHTML = rows.slice(0, limit).map((p, i) => {
      posRank[p.p] = (posRank[p.p] || 0) + 1;
      const cells = p.sched.map(([w, opp, m]) => {
        const g = grade(m), po = D.playoffs.includes(w) ? " po" : "";
        return `<td class="rs-m ${g}${po}" title="Week ${w}: ${opp ? "vs " + (TEAM[opp] || opp) + " · " + word[g] : "bye"}">${opp || "BYE"}</td>`;
      }).join("");
      const out = p.out ? `<span class="rs-out">Hasn't played since Week ${p.out}</span>` : "";
      return `<tr><td class="rs-rk">${i + 1}</td>` +
        `<th scope="row" class="rs-pl"><a href="fantasy/${p.slug}.html">${esc(p.n)}</a>` +
        `<span>${p.p}${pos === "All" ? "" : posRank[p.p]} · ${esc(TEAM[p.t] || p.t)}</span>${out}</th>` +
        `<td class="rs-proj">${p.ros[fmt].toFixed(0)}</td><td class="rs-ppg">${p.ppg[fmt].toFixed(1)}</td>${cells}</tr>`;
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
  function render() { mark("rs-fmt", "fmt", fmt); mark("rs-pos", "pos", pos); rankings(); }

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
  $("rs-out").addEventListener("change", (e) => { showOut = e.target.checked; render(); });
  $("rs-more").addEventListener("click", () => { limit = 1000; rankings(); });
  render();
  playoffs();
})();
