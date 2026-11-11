// Big Head GM fantasy mock draft: set up a league, draft against computer managers.
// Player numbers come from the page (built by build_pages.py from fantasy.py).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const raw = JSON.parse($("fd-data").textContent);
  const FMT = { std: 0, half: 1, ppr: 2, tep: 3 };
  const POS = ["QB", "RB", "WR", "TE"];
  const SPEED = { fast: 120, normal: 450, slow: 1000 };
  const count = (path, title) => { try { window.BHG && BHG.countEvent(path, title); } catch (e) { /* ignore */ } };

  const ALL = [
    ...raw.v.map(([name, team, pos, games, ppg, age, slug, real]) =>
      ({ name, team, pos, games, ppg, real, dyn: null, age, slug, rookie: false })),
    ...raw.r.map(([name, pos, college, ppg, dyn, age, team, slug]) =>
      ({ name, team: team || college, college, pos, ppg, dyn, age, slug, rookie: true })),
  ];

  // ---------- settings ----------
  const DEFAULTS = { teams: 12, slot: "r", fmt: "ppr", kind: "redraft", qb: "1qb", rb: 2, wr: 2, te: 1, flex: 1, bench: 6, rrounds: 4, order: "snake", speed: "normal" };
  let S = { ...DEFAULTS };
  try { Object.assign(S, JSON.parse(localStorage.getItem("bhg-fd-settings") || "{}")); } catch (e) { /* first visit */ }
  const save = () => { try { localStorage.setItem("bhg-fd-settings", JSON.stringify(S)); } catch (e) { /* private mode */ } };

  const qbSlots = () => (S.qb === "2qb" ? 2 : 1);
  const sfSlots = () => (S.qb === "sf" ? 1 : 0);
  const starters = () => qbSlots() + sfSlots() + S.rb + S.wr + S.te + S.flex;
  const totalRounds = () => (S.kind === "rookie" ? S.rrounds : starters() + S.bench);

  // ---------- player values ----------
  // Redraft: 2027 points per game, a little lower for players getting old.
  function redraftMult(pos, age) {
    if (!age) return 1;
    const a = age + 1;   // a year older next season
    const start = { QB: 37, RB: 30, WR: 31, TE: 32 }[pos];
    const drop = { QB: 0.04, RB: 0.05, WR: 0.04, TE: 0.04 }[pos];
    return a < start ? 1 : Math.max(0.6, 1 - drop * (a - start + 1));
  }
  // Dynasty: years of good football left matter as much as points now.
  function dynastyMult(pos, age) {
    const cliff = { QB: 37, RB: 29, WR: 31, TE: 32 }[pos];
    const top = pos === "QB" && S.qb === "1qb" ? 1.0 : 1.35;   // one-QB leagues: young QBs are nice, not first-rounders
    return Math.max(0.3, Math.min(top, 0.35 + 0.09 * (cliff - (age || 27))));
  }
  function value(p) {
    const i = FMT[S.fmt];
    if (S.kind === "redraft") return p.rookie ? p.ppg[i] : p.ppg[i] * redraftMult(p.pos, p.age);
    let v = p.rookie ? p.dyn[i] : p.ppg[i] * dynastyMult(p.pos, p.age);
    if (S.kind === "rookie" && p.pos === "QB" && S.qb !== "1qb") v *= 1.3;   // QBs go early when you can start two
    return v;
  }

  // Value over a replacement-level starter: how the "rank" column is built.
  function rankPool(pool) {
    const T = S.teams, sf = sfSlots();
    const demand = {
      QB: T * (qbSlots() + sf * 0.85),
      RB: T * (S.rb + S.flex * 0.45 + sf * 0.07),
      WR: T * (S.wr + S.flex * 0.45 + sf * 0.07),
      TE: T * (Math.max(S.te, 0.3) + S.flex * 0.1),
    };
    for (const p of pool) p.v = value(p);
    for (const pos of POS) {
      const group = pool.filter((p) => p.pos === pos).sort((a, b) => b.v - a.v);
      const idx = Math.min(group.length - 1, Math.floor(S.kind === "rookie" ? demand[pos] / 6 : demand[pos]));
      const repl = idx >= 0 ? group[idx].v : 0;
      // 1-QB leagues: plenty of good QBs to go around, so they go later than their points suggest
      const discount = pos === "QB" && S.qb === "1qb" && S.kind !== "rookie" ? 0.55 : 1;
      group.forEach((p, k) => { p.vor = (p.v - repl) * (p.v > repl ? discount : 1); p.posRank = k + 1; });
    }
    pool.sort((a, b) => b.vor - a.vor);
    pool.forEach((p, k) => { p.rank = k + 1; });
    return pool;
  }

  // ---------- lineups ----------
  function bestLineup(players) {
    if (S.kind === "rookie") {   // a rookie draft has no lineup: every pick counts
      const slots = players.map((p, i) => ({ label: "RD " + (i + 1), p }));
      return { slots, bench: [], points: players.reduce((t, p) => t + p.v, 0) };
    }
    const left = [...players].sort((a, b) => b.v - a.v);
    const take = (ok) => { const k = left.findIndex(ok); return k === -1 ? null : left.splice(k, 1)[0]; };
    const slots = [];
    const fill = (label, n, ok) => { for (let i = 0; i < n; i++) slots.push({ label, p: take(ok) }); };
    fill("QB", qbSlots(), (p) => p.pos === "QB");
    fill("RB", S.rb, (p) => p.pos === "RB");
    fill("WR", S.wr, (p) => p.pos === "WR");
    fill("TE", S.te, (p) => p.pos === "TE");
    fill("FLEX", S.flex, (p) => p.pos !== "QB");
    fill("SFLX", sfSlots(), () => true);
    return { slots, bench: left, points: slots.reduce((t, s) => t + (s.p ? s.p.v : 0), 0) };
  }

  // ---------- the draft ----------
  let pool = [], available = [], teams = [], order = [], nextPick = 0, mySlot = 0, timer = null;
  let paused = false, autoMe = false, filter = "ALL", search = "";

  function buildOrder() {
    const out = [];
    for (let r = 1; r <= totalRounds(); r++) {
      let idx = [...Array(S.teams).keys()];
      const reverse = S.order === "snake" ? r % 2 === 0 : S.order === "third" ? (r === 2 || (r >= 3 && r % 2 === 1)) : false;
      if (reverse) idx.reverse();
      idx.forEach((t, i) => out.push({ round: r, inRound: i + 1, overall: out.length + 1, team: t, player: null }));
    }
    return out;
  }
  const label = (pk) => `${pk.round}.${String(pk.inRound).padStart(2, "0")}`;
  const teamName = (t) => (t === mySlot ? "You" : `Team ${t + 1}`);

  function posLimit(pos) {
    if (pos === "QB") return S.qb === "1qb" ? 2 : 4;
    if (pos === "TE") return Math.max(1, S.te) + 1;
    return 99;
  }

  function cpuChoice(t, pk) {
    const mine = teams[t];
    const have = (pos) => mine.filter((p) => p.pos === pos).length;
    const dedicated = { QB: qbSlots(), RB: S.rb, WR: S.wr, TE: S.te };
    const picksLeft = totalRounds() - pk.round + 1;
    const open = POS.filter((pos) => have(pos) < dedicated[pos]);
    const openCount = open.reduce((t2, pos) => t2 + dedicated[pos] - have(pos), 0);

    // running out of picks: fill the empty starting spots first
    let cands = openCount >= picksLeft ? available.filter((p) => open.includes(p.pos)) : available;
    cands = cands.filter((p) => have(p.pos) < posLimit(p.pos));
    if (!cands.length) cands = available;
    const look = cands.slice(0, 8 + Math.round(pk.round / 2));

    let best = null, bestScore = -Infinity;
    for (const p of look) {
      const spread = Math.max(1.2, Math.abs(p.vor) * 0.25 + p.v * 0.04);
      let score = p.vor + (Math.random() * 2 - 1) * spread;
      if (have(p.pos) < dedicated[p.pos]) score += 1.2;                                  // fills a starting spot
      if (p.pos === "QB" && S.qb === "1qb" && have("QB") >= 1) score -= 4;              // backup QBs wait
      if (p.pos === "TE" && have("TE") >= Math.max(1, S.te)) score -= 3;               // backup TEs wait
      if (S.kind !== "rookie" && pk.round <= 2 && p.pos === "QB" && S.qb === "1qb") score -= 2;  // no QB in the first two rounds of 1-QB
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best || available[0];
  }

  function makePick(p) {
    const pk = order[nextPick];
    pk.player = p;
    teams[pk.team].push(p);
    available = available.filter((x) => x !== p);
    nextPick++;
    renderFeed(pk);
    renderRoster();
    renderBoard();
  }

  function step() {
    clearTimeout(timer);
    if (paused) return;
    const pk = order[nextPick];
    if (!pk) return finish();
    if (pk.team === mySlot && !autoMe) return yourTurn(pk);
    if (pk.team === mySlot) {
      makePick(cpuChoice(pk.team, pk));
      return schedule();
    }
    status(`<b>${teamName(pk.team)}</b> is picking · ${label(pk)} <span class="fd-muted">(${untilMe()})</span>`);
    makePick(cpuChoice(pk.team, pk));
    schedule();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(step, SPEED[S.speed]); };

  function untilMe() {
    const k = order.findIndex((p, i) => i >= nextPick && p.team === mySlot);
    if (k === -1) return "your draft is done";
    const n = k - nextPick;
    return n === 0 ? "you're next" : `${n} pick${n === 1 ? "" : "s"} until you`;
  }

  function yourTurn(pk) {
    renderMine();
    status(`<b class="fd-hot">You're on the clock</b> · Pick ${label(pk)} (${pk.overall} overall). Tap Draft on a player.`, true);
    renderBoard();
  }

  function status(html, hot) {
    const el = $("fd-status");
    el.innerHTML = html;
    el.classList.toggle("on", !!hot);
    const pk = order[nextPick];
    $("fd-eyebrow").textContent = pk ? `ROUND ${pk.round} OF ${totalRounds()} · ${S.teams} TEAMS · ${fmtName()}` : "DRAFT COMPLETE";
  }
  const fmtName = () => ({ ppr: "PPR", half: "HALF PPR", std: "STANDARD", tep: "TE PREMIUM" })[S.fmt] +
    (S.qb === "sf" ? " · SUPERFLEX" : S.qb === "2qb" ? " · 2 QB" : "") +
    (S.kind === "dynasty" ? " · DYNASTY" : S.kind === "rookie" ? " · ROOKIES" : "");

  // ---------- rendering ----------
  // The number you see is real: what a veteran is averaging in 2026 in your scoring.
  // Rookies haven't played yet, so they show our projection for 2027.
  // Two numbers: what he's averaging in 2026 (real) and what we project for 2027 (age-adjusted).
  const now26 = (p) => (p.rookie ? null : p.real[FMT[S.fmt]]);
  const proj27 = (p) => (p.rookie ? p.ppg[FMT[S.fmt]] : p.ppg[FMT[S.fmt]] * redraftMult(p.pos, p.age));
  const valueText = (p) => `${now26(p) == null ? "Rookie" : "'26 " + now26(p).toFixed(1)} · '27 proj ${proj27(p).toFixed(1)}`;
  const valueHTML = (p) => `
    <span class="fd-num"><b>${now26(p) == null ? "—" : now26(p).toFixed(1)}</b><i>'26 PPG</i></span>
    <span class="fd-num proj"><b>${proj27(p).toFixed(1)}</b><i>'27 proj</i></span>`;
  const sub = (p) => p.rookie
    ? `${p.pos}${p.posRank} · Rookie · ${p.college}${p.team && p.team !== p.college ? " → " + p.team : ""}`
    : `${p.pos}${p.posRank} · ${p.team}${p.age ? " · " + p.age : ""}`;

  function renderBoard() {
    const board = $("fd-board");
    const mine = order[nextPick] && order[nextPick].team === mySlot && !autoMe && !paused;
    const q = search.trim().toLowerCase();
    const list = available.filter((p) =>
      (filter === "ALL" || (filter === "ROOK" ? p.rookie : p.pos === filter)) && (!q || p.name.toLowerCase().includes(q))).slice(0, 60);
    board.innerHTML = list.map((p) => `
      <li class="fd-row">
        <span class="fd-rk">${p.rank}</span>
        <span class="fd-pos ${p.pos.toLowerCase()}">${p.pos}</span>
        <span class="fd-who"><b>${p.name}</b><span>${sub(p)}</span></span>
        <span class="fd-val">${valueHTML(p)}</span>
        ${mine ? `<button class="fd-draft" data-i="${pool.indexOf(p)}">Draft</button>` : ""}
      </li>`).join("") || '<li class="fd-empty">No players match.</li>';
  }

  function renderFilters() {
    const opts = ["ALL", ...POS, ...(S.kind === "rookie" ? [] : ["ROOK"])];
    $("fd-filters").innerHTML = opts.map((f) =>
      `<button class="filter${f === filter ? " active" : ""}" data-f="${f}" aria-pressed="${f === filter}">${f === "ALL" ? "All" : f === "ROOK" ? "Rookies" : f}</button>`).join("");
  }

  function rosterHTML(players, opts = {}) {
    const { slots, bench } = bestLineup(players);
    const row = (lab, p, cls = "") => `<li class="fd-slot ${cls}${p ? " " + p.pos.toLowerCase() : ""}"><span class="fd-slot-l">${lab}</span>${p
      ? `<span class="fd-who"><b>${opts.links ? `<a href="${p.rookie ? "players/" : "fantasy/"}${p.slug}.html">${p.name}</a>` : p.name}</b><span>${p.pos} · ${p.rookie ? p.team || "Rookie" : p.team} · ${valueText(p)}</span></span>`
      : '<span class="fd-who fd-muted">Empty</span>'}</li>`;
    return slots.map((s) => row(s.label, s.p)).join("") + bench.map((p) => row("BN", p, "bn")).join("");
  }
  function renderRoster() {
    $("fd-roster").innerHTML = rosterHTML(teams[mySlot] || []);
    renderMine();
  }

  // Your picks in draft order, plus the ones still coming, in a strip that's always near the top
  function renderMine() {
    const list = $("fd-mine");
    const made = order.filter((pk) => pk.team === mySlot && pk.player);
    const coming = order.filter((pk, i) => i >= nextPick && pk.team === mySlot);
    const onClock = order[nextPick] && order[nextPick].team === mySlot;
    $("fd-mine-count").textContent = `${made.length} of ${made.length + coming.length}`;
    list.innerHTML = made.map((pk, k) => `
      <li class="fd-chip ${pk.player.pos.toLowerCase()}${k === made.length - 1 ? " new" : ""}">
        <span class="fd-chip-pk">${label(pk)}</span>
        <span class="fd-chip-who"><b>${pk.player.name}</b><span>${pk.player.pos} · ${pk.player.rookie ? "Rookie" : pk.player.team}</span></span>
      </li>`).join("") + coming.slice(0, 3).map((pk, k) => `
      <li class="fd-chip next${k === 0 && onClock ? " now" : ""}">
        <span class="fd-chip-pk">${label(pk)}</span>
        <span class="fd-chip-who"><b>${k === 0 && onClock ? "On the clock" : k === 0 ? "Up next" : "Coming up"}</b><span>${pk.overall} overall</span></span>
      </li>`).join("");
    const last = list.querySelector(".fd-chip.new");
    if (last) list.scrollLeft = Math.max(0, last.offsetLeft - 16);
  }

  function renderFeed(pk) {
    const feed = $("fd-feed");
    if (!pk) { feed.innerHTML = ""; return; }
    const li = document.createElement("li");
    li.className = pk.team === mySlot ? "fd-tick mine" : "fd-tick";
    li.innerHTML = `<span class="fd-tl">${label(pk)} · ${teamName(pk.team)}</span><b>${pk.player.name}</b><span class="fd-pos ${pk.player.pos.toLowerCase()}">${pk.player.pos}</span>`;
    feed.prepend(li);
    while (feed.children.length > 12) feed.lastChild.remove();
  }

  // ---------- results ----------
  function grade(rank, n) {
    if (rank === 1) return "A+";
    const p = (rank - 1) / Math.max(1, n - 1);
    return p <= 0.2 ? "A" : p <= 0.35 ? "B+" : p <= 0.5 ? "B" : p <= 0.65 ? "C+" : p <= 0.8 ? "C" : "D";
  }

  function finish() {
    clearTimeout(timer);
    count("fantasy-draft-done", "Finished a fantasy mock draft");
    const scores = teams.map((ps, t) => ({ t, ...bestLineup(ps) })).sort((a, b) => b.points - a.points);
    const myRank = scores.findIndex((s) => s.t === mySlot) + 1;
    const me = scores[myRank - 1];
    const g = grade(myRank, S.teams);
    const unit = S.kind === "redraft" ? "points a week" : "dynasty value";
    $("fd-r-eyebrow").textContent = `DRAFT COMPLETE · ${S.teams} TEAMS · ${fmtName()}`;
    $("fd-grade").innerHTML = `
      <span class="fd-letter g-${g[0].toLowerCase()}">${g}</span>
      <span class="fd-grade-text"><b>${myRank === 1 ? "Best team in the league" : `${ordinal(myRank)} of ${S.teams}`}</b>
      <span>${S.kind === "rookie" ? "Your rookies add up to" : "Your starters project to"} ${me.points.toFixed(1)} ${unit}. ${myRank === 1 ? "Nice draft." : `The top team is at ${scores[0].points.toFixed(1)}.`}</span></span>`;
    $("fd-r-head").textContent = S.kind === "rookie" ? "Your rookies" : "Your starting lineup";
    $("fd-power-note").textContent = S.kind === "rookie" ? "Total dynasty value of each team's rookies." :
      S.kind === "dynasty" ? "Dynasty value of each team's best starting lineup." : "Projected 2027 points per week from each team's best starting lineup (adjusted for age).";
    $("fd-r-lineup").innerHTML = rosterHTML(teams[mySlot], { links: true });
    $("fd-power").innerHTML = scores.map((s, k) => {
      const stars = [...teams[s.t]].sort((a, b) => b.v - a.v).slice(0, 2).map((p) => p.name).join(", ");
      return `<li class="${s.t === mySlot ? "mine" : ""}"><span class="fd-rk">${k + 1}</span><span class="fd-who"><b>${teamName(s.t)}</b><span>${stars}</span></span><span class="fd-val">${s.points.toFixed(1)}</span></li>`;
    }).join("");
    let grid = "<thead><tr><th>Rd</th>" + teams.map((_, t) => `<th class="${t === mySlot ? "mine" : ""}">${teamName(t)}</th>`).join("") + "</tr></thead><tbody>";
    for (let r = 1; r <= totalRounds(); r++) {
      grid += `<tr><th>${r}</th>`;
      for (let t = 0; t < S.teams; t++) {
        const pk = order.find((x) => x.round === r && x.team === t);
        const p = pk && pk.player;
        grid += `<td class="${p ? p.pos.toLowerCase() : ""}${t === mySlot ? " mine" : ""}">${p ? `<b>${p.name}</b><span>${label(pk)} · ${p.pos}</span>` : ""}</td>`;
      }
      grid += "</tr>";
    }
    $("fd-grid").innerHTML = grid + "</tbody>";
    show("fd-results");
  }
  const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

  // ---------- setup screen ----------
  function show(id) {
    for (const s of ["fd-setup", "fd-draft", "fd-results"]) $(s).hidden = s !== id;
    document.body.classList.toggle("fd-drafting", id === "fd-draft");
    window.scrollTo(0, 0);
  }

  function renderSetup() {
    document.querySelectorAll("#fd-setup [data-set]").forEach((b) => {
      const on = String(S[b.dataset.set]) === b.dataset.v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on);
    });
    $("fd-slots").innerHTML = [["r", "Random"], ...[...Array(S.teams).keys()].map((i) => [String(i + 1), String(i + 1)])]
      .map(([v, l]) => `<button class="filter${String(S.slot) === v ? " active" : ""}" data-slot="${v}" aria-pressed="${String(S.slot) === v}">${l}</button>`).join("");
    document.querySelectorAll(".fd-step").forEach((el) => { el.querySelector(".fd-step-v").textContent = S[el.dataset.key]; });
    const rookie = S.kind === "rookie";
    $("fd-lineup-group").hidden = rookie;
    $("fd-rounds-group").hidden = !rookie;
    $("fd-kind-note").textContent = {
      redraft: "One season. Players are ranked on what they should score in 2027, rookies included.",
      dynasty: "Keep your team for years. Young players count for more, older ones for less.",
      rookie: "Only the 2027 rookie class. Great for dynasty leagues getting ready for their rookie draft.",
    }[S.kind];
    const qbTxt = S.qb === "sf" ? "1 QB + 1 Superflex" : S.qb === "2qb" ? "2 QB" : "1 QB";
    $("fd-summary").textContent = rookie
      ? `${S.teams} teams · ${S.rrounds} rounds · ${S.teams * S.rrounds} rookies drafted`
      : `${S.teams} teams · ${totalRounds()} rounds · Starters: ${qbTxt}, ${S.rb} RB, ${S.wr} WR, ${S.te} TE, ${S.flex} FLEX · ${S.bench} bench`;
  }

  $("fd-setup").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.set) {
      const key = b.dataset.set, v = b.dataset.v;
      S[key] = ["teams", "rrounds"].includes(key) ? Number(v) : v;
      if (key === "teams" && S.slot !== "r" && Number(S.slot) > S.teams) S.slot = "r";
    } else if (b.dataset.slot) {
      S.slot = b.dataset.slot;
    } else if (b.dataset.d) {
      const el = b.closest(".fd-step"), key = el.dataset.key;
      S[key] = Math.max(Number(el.dataset.lo), Math.min(Number(el.dataset.hi), S[key] + Number(b.dataset.d)));
    } else return;
    save();
    renderSetup();
  });

  function start() {
    count("fantasy-draft-start", "Started a fantasy mock draft");
    pool = rankPool(ALL.filter((p) => S.kind !== "rookie" || p.rookie).map((p) => ({ ...p })));
    const needed = S.teams * totalRounds();
    if (pool.length < needed) {   // a huge rookie-only draft: trim rounds to fit the class
      S.rrounds = Math.floor(pool.length / S.teams);
    }
    available = [...pool];
    teams = [...Array(S.teams)].map(() => []);
    order = buildOrder();
    mySlot = S.slot === "r" ? Math.floor(Math.random() * S.teams) : Number(S.slot) - 1;
    nextPick = 0; paused = false; autoMe = false; filter = "ALL"; search = "";
    $("fd-search").value = "";
    $("fd-title").textContent = `You pick ${ordinal(mySlot + 1)}`;
    $("fd-pause").textContent = "Pause";
    $("fd-auto").textContent = "Auto-pick for me";
    renderFeed(null);
    renderFilters();
    renderRoster();
    show("fd-draft");
    status("Starting…");
    renderBoard();
    schedule();
  }

  $("fd-start").addEventListener("click", start);
  $("fd-again").addEventListener("click", start);
  $("fd-settings").addEventListener("click", () => { renderSetup(); show("fd-setup"); });
  $("fd-quit").addEventListener("click", () => { clearTimeout(timer); renderSetup(); show("fd-setup"); });
  $("fd-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    renderFilters();
    renderBoard();
  });
  $("fd-search").addEventListener("input", (e) => { search = e.target.value; renderBoard(); });
  $("fd-board").addEventListener("click", (e) => {
    const b = e.target.closest(".fd-draft");
    if (!b) return;
    const pk = order[nextPick];
    const p = pool[Number(b.dataset.i)];
    if (!pk || pk.team !== mySlot || !available.includes(p)) return;
    makePick(p);
    $("fd-search").value = ""; search = "";
    renderBoard();
    schedule();
  });
  $("fd-pause").addEventListener("click", () => {
    paused = !paused;
    $("fd-pause").textContent = paused ? "Resume" : "Pause";
    if (paused) { clearTimeout(timer); status("<b>Paused</b> · Tap Resume to keep drafting."); renderBoard(); }
    else step();
  });
  $("fd-auto").addEventListener("click", () => {
    autoMe = !autoMe;
    $("fd-auto").textContent = autoMe ? "Stop auto-pick" : "Auto-pick for me";
    if (!paused) step();
    else renderBoard();
  });

  renderSetup();
})();
