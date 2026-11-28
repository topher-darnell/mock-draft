/*
  Franchise: draft a 22-man starting lineup from every active NFL player (22 rounds, snake,
  against 31 computer GMs), then play the real 2026 schedule, the playoffs and the Super Bowl.

  Data: franchise-data.json (built by mockdraft/franchise.py from nflverse)
    players: [name, team, slot, rating 50-99, age, stat line, potential]
    schedule: [week, away, home, (away score, home score if played)]
*/
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const app = $("fr-app");
  if (!app) return;

  const DIVS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"], "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"], "AFC West": ["DEN", "KC", "LV", "LAC"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"], "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"], "NFC West": ["ARI", "LAR", "SF", "SEA"]
  };
  const DIV_OF = {};
  for (const d in DIVS) for (const t of DIVS[d]) DIV_OF[t] = d;
  const HAS_GM = typeof GM !== "undefined";
  const NAME = {};                               // "CHI" -> "Chicago Bears"
  if (HAS_GM) for (const full in GM.ABBR) NAME[GM.ABBR[full].toUpperCase()] = full;
  const short = (ab) => (HAS_GM ? GM.short(NAME[ab]) : ab);
  const gm = (ab, mood, size) => HAS_GM ? `<span class="avatar fr-av" style="background:${GM.tint(NAME[ab])}">${GM.img(NAME[ab], mood, size)}</span>` : "";

  // lineup order and how much each spot matters in a game
  const ORDER = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"];
  const OFF_W = { QB: 0.30, RB: 0.07, WR: 0.07, TE: 0.06, OT: 0.08, IOL: 0.0667 };   // per player (WR x3, OT x2, IOL x3)
  const DEF_W = { EDGE: 0.12, IDL: 0.08, LB: 0.07, CB: 0.09, S: 0.095 };
  // how the computer GMs value each spot when drafting
  // how much each spot matters to a real front office: QB first, then the pass rush, the tackles and the middle of the defense
  const POS_W = { QB: 2.2, EDGE: 1.6, OT: 1.45, LB: 1.3, IDL: 1.3, CB: 1.2, WR: 1.1, S: 0.95, IOL: 0.9, TE: 0.85, RB: 0.75 };
  const ROUNDS = 22;
  const BEST_KEY = "bhg-franchise-best";

  let D = null;              // the data file
  let me = null;             // your team abbr
  let order = [];            // 32 teams, round 1 order
  let pool = [];             // available players (objects)
  let rosters = {};          // abbr -> [player]
  let open = {};             // abbr -> {slot: open count}
  let pickNo = 0;            // 0..703
  let filter = "All";
  let lastPicks = [];
  let allPicks = [];         // every pick so far: {n, round, t, p}
  let sortBy = "rating";     // rating | pot
  let view = "players";      // draft screen: players | board | teams
  let viewTeam = null;

  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // ---------- load ----------

  fetch("franchise-data.json?v=" + (app.dataset.v || "1"))
    .then((r) => r.json())
    .then((data) => { D = data; showPickTeam(); })
    .catch(() => { app.innerHTML = `<p class="pg-text">Couldn't load the player list. Check your connection and refresh.</p>`; });

  // ---------- 1. pick your team ----------

  function showPickTeam() {
    const teams = Object.keys(DIV_OF).sort((a, b) => (NAME[a] || a).localeCompare(NAME[b] || b));
    let best = null;
    try { best = JSON.parse(localStorage.getItem(BEST_KEY) || "null"); } catch (e) { best = null; }
    app.innerHTML = `
      <section class="gm-panel">
        <p class="pg-text">Build a team from <b>every active NFL player</b>. Draft 22 starters in 22 rounds against 31 GMs, then play the real ${D.season} schedule. Make the playoffs, win the Super Bowl.</p>
        <ul class="gm-rules">
          <li><b>22 rounds:</b> QB, RB, 3 WR, TE, 2 OT, 3 interior line, 2 edge, 2 DL, 2 LB, 3 CB, 2 S.</li>
          <li><b>Ratings</b> come from this season's snaps and stats, through week ${D.through_week}.</li>
          <li><b>Snake draft:</b> you pick where your team picks, then the order flips each round.</li>
        </ul>
        ${best ? `<p class="in-note">Your best: <b>${esc(best.text)}</b></p>` : ""}
        <h2 class="fr-h2">Pick your team</h2>
        <div class="fr-teams">${teams.map((t) => `<button class="fr-team" data-t="${t}">${gm(t, "neutral", 40)}<span>${esc(short(t))}</span></button>`).join("")}</div>
      </section>`;
    app.querySelectorAll(".fr-team").forEach((b) => b.addEventListener("click", () => startDraft(b.dataset.t)));
  }

  // ---------- 2. the draft ----------

  // standings2026 is no longer used for the order; kept for reference
  function standings2026() {
    const rec = {};
    for (const t in DIV_OF) rec[t] = { w: 0, l: 0, pd: 0 };
    for (const g of D.schedule) {
      if (g.length < 5) continue;
      const [, a, h, as, hs] = g;
      rec[a].pd += as - hs; rec[h].pd += hs - as;
      if (as > hs) { rec[a].w++; rec[h].l++; } else if (hs > as) { rec[h].w++; rec[a].l++; }
    }
    return rec;
  }

  function startDraft(team) {
    me = team;
    const rec = standings2026();
    // a new random order every draft
    order = Object.keys(DIV_OF);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    pool = D.players.map(([name, team, slot, rating, age, line, pot], i) => ({ id: i, name, team, slot, rating, age, line, pot: pot || rating }));
    rosters = {}; open = {};
    for (const t of order) { rosters[t] = []; open[t] = Object.assign({}, D.slots); }
    pickNo = 0; filter = "All"; lastPicks = []; allPicks = []; view = "players"; viewTeam = null;
    updateReplacement();
    if (HAS_GM) GM.preload(NAME[me]);
    runToMyPick();
  }

  const teamAt = (n) => { const r = Math.floor(n / 32), i = n % 32; return order[r % 2 ? 31 - i : i]; };
  const roundOf = (n) => Math.floor(n / 32) + 1;

  // Computer GMs draft on value over the player they could get later at that spot, weighted by how much the spot matters.
  // "Later" = the best player left at that spot once every team that still needs one has taken one.
  let repl = {};
  function updateReplacement() {
    repl = {};
    for (const slot of ORDER) {
      let need = 0;
      for (const t in open) need += open[t][slot];
      const left = pool.filter((p) => p.slot === slot);       // pool is best first
      repl[slot] = left.length ? left[Math.min(left.length - 1, Math.max(0, need - 1))].rating : 50;
    }
  }

  function cpuChoose(t) {
    if (pickNo % 8 === 0) updateReplacement();
    let best = null, bestV = -1e9;
    const left = open[t];
    for (const p of pool) {
      if (!left[p.slot]) continue;
      // half positional value, half best player available, so stars at any spot still go early
      const v = (1 + POS_W[p.slot]) / 2 * (p.rating - repl[p.slot]) + (Math.random() * 6 - 3);
      if (v > bestV) { bestV = v; best = p; }
    }
    return best;
  }

  function take(t, p) {
    pool.splice(pool.indexOf(p), 1);
    rosters[t].push(p);
    open[t][p.slot]--;
    lastPicks.unshift({ n: pickNo + 1, t, p });
    allPicks.push({ n: pickNo + 1, round: roundOf(pickNo), t, p });
    if (lastPicks.length > 8) lastPicks.pop();
    pickNo++;
  }

  function runToMyPick() {
    while (pickNo < 32 * ROUNDS && teamAt(pickNo) !== me) take(teamAt(pickNo), cpuChoose(teamAt(pickNo)));
    if (pickNo >= 32 * ROUNDS) return showSeason();
    renderDraft();
  }

  function myPick(p) {
    take(me, p);
    const n = pickNo;
    // a quick reaction, then the other GMs pick
    renderDraft(p);
    setTimeout(() => { if (pickNo === n) runToMyPick(); }, 650);
  }

  if (/[?&]frdebug/.test(location.search)) window.__fr = { rosters: () => rosters, order: () => order };

  function autoRest() {
    while (pickNo < 32 * ROUNDS) take(teamAt(pickNo), cpuChoose(teamAt(pickNo)));
    showSeason();
  }

  function renderDraft(justTook) {
    const done = pickNo >= 32 * ROUNDS;
    const round = roundOf(Math.min(pickNo, 32 * ROUNDS - 1));
    const left = open[me];
    const slots = ORDER.filter((s) => left[s] > 0);
    if (filter !== "All" && !left[filter]) filter = "All";
    let list = pool.filter((p) => left[p.slot] > 0 && (filter === "All" || p.slot === filter));
    if (sortBy === "pot") list = list.slice().sort((a, b) => b.pot - a.pot || b.rating - a.rating);
    list = list.slice(0, 40);
    const mood = justTook ? (justTook.rating >= 92 ? "happy" : justTook.rating < 70 ? "shocked" : "neutral") : "neutral";
    const line = justTook
      ? (justTook.rating >= 92 ? pickOne(["Franchise guy. Done.", "That's a cornerstone.", "Somebody check on the other 31 GMs."])
        : justTook.rating < 70 ? pickOne(["Bold.", "I'm sure he's great in the locker room.", "We'll call that a project."])
        : pickOne(["Solid. Keep stacking.", "Good value right there.", "He fits what we do."]))
      : `Round ${round} · pick ${pickNo + 1} of ${32 * ROUNDS} · you pick #${order.indexOf(me) + 1} in round 1`;
    app.innerHTML = `
      <div class="fr-clock">
        <div class="fr-clock-text">
          <span class="fr-eyebrow">${justTook ? "YOU TOOK" : `ON THE CLOCK · ROUND ${round}`}</span>
          <b>${justTook ? esc(justTook.name) : esc(NAME[me] || me)}</b>
          <span class="fr-quote">${esc(line)}</span>
        </div>
        ${HAS_GM ? `<div class="fr-clock-gm">${GM.img(NAME[me], mood, 84)}</div>` : ""}
      </div>
      ${done || justTook ? "" : `
      <div class="fr-tabs" role="tablist">
        ${[["players", "Available"], ["board", `Picks (${allPicks.length})`], ["teams", "Teams"]].map(([k, l]) => `<button class="fr-tab${view === k ? " on" : ""}" role="tab" aria-selected="${view === k}" data-v="${k}">${l}</button>`).join("")}
      </div>
      ${view === "players" ? `
      <div class="fr-chips" role="group" aria-label="Filter by position">
        ${["All", ...slots].map((s) => `<button class="fr-chip${s === filter ? " on" : ""}" data-f="${s}">${s}${s === "All" ? "" : ` <i>${left[s]}</i>`}</button>`).join("")}
      </div>
      <div class="fr-sort" role="group" aria-label="Sort by">Sort: ${[["rating", "Rating"], ["pot", "Potential"]].map(([k, l]) => `<button class="fr-sortb${sortBy === k ? " on" : ""}" data-s="${k}">${l}</button>`).join("")}</div>
      <ol class="fr-board">
        ${list.map((p) => `
          <li class="fr-row">
            <span class="fr-ovr${p.rating >= 90 ? " elite" : p.rating >= 80 ? " good" : ""}">${p.rating}</span>
            <span class="fr-who"><b>${esc(p.name)}</b><span>${p.slot} · ${p.team}${p.age ? ` · Age ${p.age}` : ""} · ${potTag(p)}</span><span>${esc(p.line)}</span></span>
            <button class="fr-draft" data-id="${p.id}">Draft</button>
          </li>`).join("")}
      </ol>
      <button class="secondary gm-wide fr-auto" id="fr-auto">Auto-draft the rest for me</button>` : view === "board" ? boardHTML() : teamsHTML()}`}
      <h2 class="fr-h2">Your lineup · ${rosters[me].length}/22</h2>
      ${lineupHTML(me)}
      ${lastPicks.length && view === "players" ? `<h2 class="fr-h2">Latest picks</h2><ol class="fr-feed">${lastPicks.map((x) => `<li>${gm(x.t, x.p.rating >= 90 ? "happy" : "neutral", 26)}<span><b>${x.n}. ${esc(short(x.t))}</b> ${esc(x.p.name)} · ${x.p.slot} ${x.p.rating}</span></li>`).join("")}</ol>` : ""}`;
    app.querySelectorAll(".fr-tab").forEach((b) => b.addEventListener("click", () => { view = b.dataset.v; renderDraft(); }));
    const sel = $("fr-team-pick");
    if (sel) sel.addEventListener("change", () => { viewTeam = sel.value; renderDraft(); });
    app.querySelectorAll(".fr-sortb").forEach((b) => b.addEventListener("click", () => { sortBy = b.dataset.s; renderDraft(); }));
    app.querySelectorAll(".fr-chip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; renderDraft(); }));
    app.querySelectorAll(".fr-draft").forEach((b) => b.addEventListener("click", () => {
      const p = pool.find((x) => x.id === Number(b.dataset.id));
      if (p && teamAt(pickNo) === me) myPick(p);
    }));
    const auto = $("fr-auto");
    if (auto) auto.addEventListener("click", autoRest);
    if (!justTook && view === "players") app.scrollIntoView({ block: "start" });
  }

  // every pick so far, newest first, grouped by round
  function boardHTML() {
    if (!allPicks.length) return `<p class="in-note">No picks yet.</p>`;
    let html = "", round = 0;
    for (const x of allPicks.slice().reverse()) {
      if (x.round !== round) { if (round) html += "</ol>"; round = x.round; html += `<h3 class="fr-round">Round ${round}</h3><ol class="fr-feed fr-allpicks">`; }
      html += `<li class="${x.t === me ? "mine" : ""}">${gm(x.t, "neutral", 26)}<span><b>${x.n}. ${esc(short(x.t))}</b> ${esc(x.p.name)} · ${x.p.slot} · <span class="fr-r">${x.p.rating}</span></span></li>`;
    }
    return html + "</ol>";
  }

  // any team's lineup so far
  function teamsHTML() {
    const teams = order.slice().sort((a, b) => (NAME[a] || a).localeCompare(NAME[b] || b));
    if (!viewTeam || viewTeam === me) viewTeam = teams.find((t) => t !== me);
    return `<label class="fr-pick-label" for="fr-team-pick">Team</label>
      <select class="fr-select" id="fr-team-pick">${teams.filter((t) => t !== me).map((t) => `<option value="${t}"${t === viewTeam ? " selected" : ""}>${esc(NAME[t] || t)} · picks #${order.indexOf(t) + 1}</option>`).join("")}</select>
      <h2 class="fr-h2">${esc(NAME[viewTeam] || viewTeam)} · ${rosters[viewTeam].length}/22</h2>
      ${lineupHTML(viewTeam)}`;
  }

  // potential, with a little arrow when there's room to grow
  function potTag(p) {
    const up = p.pot - p.rating;
    return `<span class="fr-pot${up >= 8 ? " big" : ""}">Pot ${p.pot}${up >= 3 ? " ▲" : ""}</span>`;
  }

  function lineupHTML(t) {
    const r = rosters[t];
    const rows = [];
    for (const s of ORDER) {
      const mine = r.filter((p) => p.slot === s).sort((a, b) => b.rating - a.rating);
      for (let i = 0; i < D.slots[s]; i++) {
        const p = mine[i];
        rows.push(`<li class="${p ? "" : "empty"}"><span class="fr-slot">${s}</span>${p ? `<span class="fr-lname">${esc(p.name)}<i>${p.age ? `Age ${p.age} · ` : ""}Pot ${p.pot}</i></span><span class="fr-ovr small${p.rating >= 90 ? " elite" : p.rating >= 80 ? " good" : ""}">${p.rating}</span>` : `<span class="fr-lname">-</span>`}</li>`);
      }
    }
    return `<ol class="fr-lineup">${rows.join("")}</ol>`;
  }

  // ---------- 3. the season ----------

  function strength(t) {
    let off = 0, def = 0;
    for (const p of rosters[t]) {
      if (OFF_W[p.slot]) off += OFF_W[p.slot] * p.rating;
      if (DEF_W[p.slot]) def += DEF_W[p.slot] * p.rating;
    }
    return { off, def, ovr: Math.round((off + def) / 2) };
  }

  function poisson(m) {
    const L = Math.exp(-Math.max(0.01, m)); let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  function score(off, oppDef, edge) {               // edge: +1.3 at home, -1.3 on the road, 0 neutral
    const mean = Math.max(6, 22 + 0.85 * (off - oppDef) + edge);
    return 7 * poisson(mean * 0.72 / 7) + 3 * poisson(mean * 0.28 / 3);
  }

  function playGame(a, h, neutral) {
    const A = STR[a], H = STR[h];
    let as = score(A.off, H.def, neutral ? 0 : -1.3), hs = score(H.off, A.def, neutral ? 0 : 1.3);
    if (as === hs) {                                   // overtime: the better team usually wins it
      const pA = 0.5 + (A.ovr - H.ovr) * 0.03;
      if (Math.random() < pA) as += 3; else hs += 3;
    }
    return { a, h, as, hs };
  }

  let STR = {};
  let season = null;

  function showSeason() {
    STR = {};
    for (const t in rosters) STR[t] = strength(t);
    const rec = {};
    for (const t in rosters) rec[t] = { w: 0, l: 0, pf: 0, pa: 0, dw: 0, dl: 0 };
    const mine = [];
    for (const [week, a, h] of D.schedule) {
      const g = playGame(a, h, false);
      const win = g.as > g.hs ? a : h, lose = win === a ? h : a;
      rec[win].w++; rec[lose].l++;
      rec[a].pf += g.as; rec[a].pa += g.hs; rec[h].pf += g.hs; rec[h].pa += g.as;
      if (DIV_OF[a] === DIV_OF[h]) { rec[win].dw++; rec[lose].dl++; }
      if (a === me || h === me) mine.push(Object.assign({ week }, g));
    }
    season = { rec, mine };
    const rank = Object.keys(STR).sort((x, y) => STR[y].ovr - STR[x].ovr).indexOf(me) + 1;

    app.innerHTML = `
      <div class="fr-clock">
        <div class="fr-clock-text">
          <span class="fr-eyebrow">${D.season} SEASON</span>
          <b>${esc(NAME[me])}</b>
          <span class="fr-quote" id="fr-sline">Team rating ${STR[me].ovr} · #${rank} of 32. Let's play.</span>
        </div>
        ${HAS_GM ? `<div class="fr-clock-gm" id="fr-sgm">${GM.img(NAME[me], "neutral", 84)}</div>` : ""}
      </div>
      <div class="fr-record"><b id="fr-rec">0-0</b><span>Offense ${Math.round(STR[me].off)} · Defense ${Math.round(STR[me].def)}</span></div>
      <ol class="fr-games" id="fr-games"></ol>
      <button class="secondary gm-wide" id="fr-skip">Skip to the end</button>`;
    let i = 0, w = 0, l = 0, timer = null;
    const list = $("fr-games");
    const step = () => {
      if (i >= mine.length) return finishSeason();
      const g = mine[i++];
      const home = g.h === me, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h;
      const won = us > them;
      if (won) w++; else l++;
      list.insertAdjacentHTML("beforeend", `<li class="${won ? "win" : "loss"}"><span class="fr-wk">W${g.week}</span>${gm(opp, won ? "disappointed" : "happy", 26)}<span class="fr-opp">${home ? "vs" : "@"} ${esc(short(opp))}</span><b>${won ? "W" : "L"} ${us}-${them}</b></li>`);
      $("fr-rec").textContent = `${w}-${l}`;
      if (HAS_GM) GM.setMood(app.querySelector("#fr-sgm .gm"), won ? "happy" : (us + 14 <= them ? "angry" : "disappointed"));
      $("fr-sline").textContent = won ? pickOne(["Too easy.", "That's how we do it.", "Book it.", "Next."]) : pickOne(["Unacceptable.", "Film room. Now.", "We'll be back.", "Somebody's getting cut."]);
      list.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
      timer = setTimeout(step, 420);
    };
    $("fr-skip").addEventListener("click", () => { clearTimeout(timer); finishSeason(); });
    timer = setTimeout(step, 600);
  }

  // ---------- 4. standings and playoffs ----------

  function ranked(teams, rec) {
    return teams.slice().sort((x, y) => {
      const a = rec[x], b = rec[y];
      return (b.w - b.l) - (a.w - a.l) || (b.dw - b.dl) - (a.dw - a.dl) || (b.pf - b.pa) - (a.pf - a.pa) || STR[y].ovr - STR[x].ovr;
    });
  }

  function seeds(conf, rec) {
    const divs = Object.keys(DIVS).filter((d) => d.startsWith(conf));
    const winners = ranked(divs.map((d) => ranked(DIVS[d], rec)[0]), rec);
    const rest = ranked(divs.flatMap((d) => DIVS[d]).filter((t) => !winners.includes(t)), rec).slice(0, 3);
    return winners.concat(rest);                       // seeds 1-7
  }

  const ROUND_NAMES = ["Wild Card", "Divisional", "Conference Championship", "Super Bowl"];

  function playoffs(rec) {
    const log = [];                                    // {round, a, h, as, hs}
    const play = (round, hi, lo, neutral) => {
      const g = playGame(lo, hi, neutral);             // the higher seed hosts
      log.push(Object.assign({ round }, g));
      return g.hs > g.as ? hi : lo;
    };
    const champs = {};
    for (const conf of ["AFC", "NFC"]) {
      const s = seeds(conf, rec);
      let alive = [s[0], play(0, s[1], s[6]), play(0, s[2], s[5]), play(0, s[3], s[4])];
      alive.sort((x, y) => s.indexOf(x) - s.indexOf(y));
      alive = [play(1, alive[0], alive[3]), play(1, alive[1], alive[2])].sort((x, y) => s.indexOf(x) - s.indexOf(y));
      champs[conf] = play(2, alive[0], alive[1]);
      champs[conf + "seeds"] = s;
    }
    const sb = play(3, champs.AFC, champs.NFC, true);
    return { log, champ: sb, seeds: { AFC: champs.AFCseeds, NFC: champs.NFCseeds } };
  }

  function finishSeason() {
    const { rec } = season;
    const po = playoffs(rec);
    const conf = DIV_OF[me].slice(0, 3);
    const seed = po.seeds[conf].indexOf(me) + 1;
    const myGames = po.log.filter((g) => g.a === me || g.h === me);
    const lastG = myGames[myGames.length - 1];
    const r = rec[me];
    const div = ranked(DIVS[DIV_OF[me]], rec);
    let result, mood, short_;
    if (po.champ === me) { result = "Super Bowl champions"; mood = "happy"; short_ = "won the Super Bowl"; }
    else if (!seed) { result = "Missed the playoffs"; mood = r.w <= 5 ? "angry" : "disappointed"; short_ = "missed the playoffs"; }
    else {
      const rn = ROUND_NAMES[lastG.round];
      result = lastG.round === 3 ? "Lost the Super Bowl" : `Lost in the ${rn} round`.replace("Conference Championship round", "Conference Championship");
      mood = lastG.round >= 2 ? "disappointed" : "shocked";
      short_ = result.toLowerCase();
    }
    const record = `${r.w}-${r.l}`;
    const text = `${record}, ${short_}`;
    saveBest(text, r.w, po.champ === me, myGames.length);

    const gameRow = (g) => {
      const home = g.h === me, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h;
      return `<li class="${us > them ? "win" : "loss"}"><span class="fr-wk">${ROUND_NAMES[g.round].replace("Conference Championship", "Conf. title")}</span>${gm(opp, us > them ? "disappointed" : "happy", 26)}<span class="fr-opp">${g.round === 3 ? "vs" : home ? "vs" : "@"} ${esc(short(opp))}</span><b>${us > them ? "W" : "L"} ${us}-${them}</b></li>`;
    };
    const confTable = (c) => po.seeds[c].map((t, i) => `<li class="${t === me ? "me" : ""}"><span class="fr-seed">${i + 1}</span>${esc(short(t))}<b>${rec[t].w}-${rec[t].l}</b></li>`).join("");

    app.innerHTML = `
      <div class="fr-result">
        ${HAS_GM ? `<div class="fr-result-gm">${GM.img(NAME[me], mood, 150)}</div>` : ""}
        <span class="fr-eyebrow">${D.season} ${esc(NAME[me]).toUpperCase()}</span>
        <h2 class="fr-big">${record}</h2>
        <p class="fr-headline">${result}${po.champ === me ? " 🏆" : ""}</p>
        <p class="in-note">${div.indexOf(me) + 1}${["st", "nd", "rd", "th"][Math.min(3, div.indexOf(me))]} in the ${DIV_OF[me]}${seed ? ` · ${conf} #${seed} seed` : ""} · ${r.pf} points for, ${r.pa} against</p>
      </div>
      <div class="bz-buttons">
        <button class="secondary" id="fr-share">Share</button>
        <button class="start" id="fr-again">Draft again</button>
      </div>
      <p class="in-note" id="fr-share-note" role="status"></p>
      ${myGames.length ? `<h2 class="fr-h2">Your playoff run</h2><ol class="fr-games">${myGames.map(gameRow).join("")}</ol>` : ""}
      <h2 class="fr-h2">Champion</h2>
      <div class="fr-champ">${gm(po.champ, "happy", 44)}<span><b>${esc(NAME[po.champ])}</b><span>${rec[po.champ].w}-${rec[po.champ].l} · team rating ${STR[po.champ].ovr}</span></span></div>
      <div class="fr-confs">
        <div><h3>AFC seeds</h3><ol class="fr-seeds">${confTable("AFC")}</ol></div>
        <div><h3>NFC seeds</h3><ol class="fr-seeds">${confTable("NFC")}</ol></div>
      </div>
      <h2 class="fr-h2">Your season</h2>
      <ol class="fr-games">${season.mine.map((g) => {
        const home = g.h === me, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h;
        return `<li class="${us > them ? "win" : "loss"}"><span class="fr-wk">W${g.week}</span>${gm(opp, us > them ? "disappointed" : "happy", 26)}<span class="fr-opp">${home ? "vs" : "@"} ${esc(short(opp))}</span><b>${us > them ? "W" : "L"} ${us}-${them}</b></li>`;
      }).join("")}</ol>
      <h2 class="fr-h2">Your lineup · team rating ${STR[me].ovr}</h2>
      ${lineupHTML(me)}`;
    $("fr-again").addEventListener("click", showPickTeam);
    $("fr-share").addEventListener("click", () => share(text, record, result, mood));
    app.scrollIntoView({ block: "start" });
  }

  function saveBest(text, w, champ, playoffGames) {
    try {
      const old = JSON.parse(localStorage.getItem(BEST_KEY) || "null");
      const score = (champ ? 1000 : 0) + playoffGames * 100 + w;
      if (!old || score > old.score) localStorage.setItem(BEST_KEY, JSON.stringify({ text: `${short(me)} ${text}`, score }));
    } catch (e) { /* private mode: no saved best */ }
  }

  // ---------- share: a picture card, or the text ----------

  async function card(record, result, mood) {
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#12151C"; x.fillRect(0, 0, W, H);
    x.fillStyle = HAS_GM ? GM.tint(NAME[me], 0.8) : "#222A35"; x.fillRect(0, 0, W, 620);
    if (HAS_GM) {
      const pic = await GM.picture(NAME[me], mood);
      if (pic) { const h = 560, w = pic.sw * h / pic.sh; x.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, (W - w) / 2, 620 - h, w, h); }
    }
    x.textAlign = "center"; x.fillStyle = "#F2A93B"; x.font = "italic 900 44px Inter, sans-serif";
    x.fillText(`FRANCHISE · ${D.season} ${(NAME[me] || me).toUpperCase()}`, W / 2, 720);
    x.fillStyle = "#fff"; x.font = "italic 900 220px Inter, sans-serif"; x.fillText(record, W / 2, 940);
    x.font = "800 64px Inter, sans-serif"; x.fillText(result, W / 2, 1040);
    x.fillStyle = "#F2A93B"; x.fillRect(0, H - 170, W, 170);
    x.fillStyle = "#12151C"; x.font = "italic 900 54px Inter, sans-serif"; x.fillText("CAN YOU WIN IT ALL?", W / 2, H - 92);
    x.font = "700 36px Inter, sans-serif"; x.fillText("bigheadgm.com/games/franchise", W / 2, H - 40);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  async function share(text, record, result, mood) {
    const note = $("fr-share-note");
    const msg = `I drafted the ${short(me)} on Big Head GM Franchise and went ${text}. Can you win it all? https://bigheadgm.com/games/franchise.html`;
    try {
      const blob = await card(record, result, mood);
      const file = new File([blob], "big-head-gm-franchise.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
        return;
      }
      if (navigator.share) { await navigator.share({ text: msg }); return; }
      await navigator.clipboard.writeText(msg);
      note.textContent = "Copied. Paste it anywhere.";
    } catch (e) {
      if (e && e.name === "AbortError") return;
      note.textContent = msg;
    }
  }
})();
