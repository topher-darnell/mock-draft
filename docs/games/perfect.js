// 17-0: draft a PPR fantasy lineup one random NFL team at a time, then play a 17-week season.
// Each round spins a team; you take one of its players for an open slot (PPR PPG shown).
// The season uses each player's real 2026 PPR points per game, with weekly swings and missed games.
// Daily: same teams and same luck for everyone. Free play: random.

(function () {
  const $ = (id) => document.getElementById(id);
  const DATA = JSON.parse($("p17-data").textContent);
  const OPP_MEAN = DATA.opp, OPP_SD = 20, SWING = 0.45;
  const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"];
  const FLEX_OK = ["RB", "WR", "TE"];
  const START = Date.UTC(2026, 10, 10);
  const URL = "bigheadgm.com/games/17-0.html";
  const KEY = "bhg-17-daily", STATS = "bhg-17-stats";
  // the leaderboard lives in Supabase (free plan). Empty = leaderboard turned off.
  const SUPA_URL = "https://xlybkkhxllgypmuakicp.supabase.co";
  const SUPA_KEY = "sb_publishable_zIGg0KqSR-XqGU48bRwYrQ_03MUQL9s";   // publishable: safe to be public
  const BOARD = !!(SUPA_URL && SUPA_KEY);
  const count = (path, title) => window.BHG && window.BHG.countEvent(path, title);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const players = DATA.players.map((r) => ({ n: r[0], slug: r[1], t: r[2], team: r[3], p: r[4], ppg: r[5], gp: r[6], tg: r[7] }));
  const TEAMS = [...new Set(players.map((p) => p.t))].sort();
  const teamName = Object.fromEntries(players.map((p) => [p.t, p.team]));
  const short = (t) => teamName[t].split(" ").pop();

  function seeded(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function dayNumber() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return Math.floor((Date.UTC(+p.year, +p.month - 1, +p.day) - START) / 864e5) + 1;
  }
  function load(k, f) { try { return JSON.parse(localStorage.getItem(k)) || f; } catch (e) { return f; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } }

  let g = null;   // { mode, day, rng, lineup: [player|null x7], round, team, respins, spins: [teams], weeks }

  function newGame(mode) {
    const day = dayNumber();
    const rng = mode === "daily" ? seeded(day * 7919 + 17) : Math.random;
    return { mode, day, rng, lineup: SLOTS.map(() => null), round: 0, team: null, respins: 1, used: [], weeks: null };
  }

  function openSlots() { return SLOTS.map((s, i) => (g.lineup[i] ? null : s)).filter(Boolean); }
  function fits(p) {
    const open = openSlots();
    return open.includes(p.p) || (open.includes("FLEX") && FLEX_OK.includes(p.p));
  }
  function choices(t) {
    const order = ["QB", "RB", "WR", "TE"];
    return players.filter((p) => p.t === t && fits(p) && !g.lineup.includes(p))
      .sort((a, b) => order.indexOf(a.p) - order.indexOf(b.p) || b.gp - a.gp || a.n.localeCompare(b.n));
  }

  // ---------- drafting ----------
  function spin() {
    let pool = TEAMS.filter((t) => !g.used.includes(t) && choices(t).length);
    if (!pool.length) pool = TEAMS.filter((t) => choices(t).length);
    const pick = pool[Math.floor(g.rng() * pool.length)];
    g.used.push(pick);
    const box = $("p17-team");
    box.classList.add("spinning");
    $("p17-list").innerHTML = "";
    $("p17-respin").hidden = true;
    let n = 0;
    const flick = setInterval(() => {
      const t = TEAMS[Math.floor(Math.random() * TEAMS.length)];
      $("p17-team-name").textContent = teamName[t];
      if (++n >= 12) {
        clearInterval(flick);
        g.team = pick;
        box.classList.remove("spinning");
        showTeam();
      }
    }, 70);
  }

  function showTeam() {
    $("p17-team-name").textContent = teamName[g.team];
    const gm = $("p17-gm");
    gm.innerHTML = "";
    gm.dataset.gm = teamName[g.team];
    gm.dataset.mood = "focused";
    gm.dataset.size = "56";
    if (window.BHG) window.BHG.paintGMs(gm.parentNode);
    $("p17-list").innerHTML = choices(g.team).map((p, i) =>
      `<li><button class="p17-pick" data-i="${i}"><span class="p17-pos p-${p.p}">${p.p}</span><b>${esc(p.n)}</b>` +
      `<span class="ff-ppg"><b>${p.ppg.toFixed(1)}</b><span>PPR PPG · ${p.gp} GP</span></span></button></li>`).join("");
    $("p17-respin").hidden = g.respins < 1;
    $("p17-respin").textContent = `Re-spin (${g.respins} left)`;
  }

  function place(p) {
    let i = SLOTS.findIndex((s, k) => s === p.p && !g.lineup[k]);
    if (i < 0) i = SLOTS.findIndex((s, k) => s === "FLEX" && !g.lineup[k]);
    if (i < 0) return;
    g.lineup[i] = p;
    g.round++;
    drawLineup();
    if (g.round >= SLOTS.length) toSeason();
    else { $("p17-round").textContent = `Round ${g.round + 1} of 7`; spin(); }
  }

  function drawLineup(reveal) {
    const html = SLOTS.map((s, i) => {
      const p = g.lineup[i];
      return `<li class="${p ? "on" : ""}"><span class="p17-slot">${s}</span>` +
        (p ? `<span class="p17-who"><b>${esc(p.n)}</b><span>${p.p} · ${esc(short(p.t))}</span></span>` +
          (reveal || true ? `<span class="ff-ppg"><b>${p.ppg.toFixed(1)}</b><span>PPR PPG</span></span>` : "")
          : `<span class="p17-who empty">Empty</span>`) + "</li>";
    }).join("");
    $("p17-lineup").innerHTML = html;
    $("p17-lineup-s").innerHTML = html;
  }

  $("p17-list").addEventListener("click", (e) => {
    const b = e.target.closest(".p17-pick");
    if (!b) return;
    place(choices(g.team)[+b.dataset.i]);
  });
  $("p17-respin").addEventListener("click", () => {
    if (g.respins < 1) return;
    g.respins--;
    spin();
  });

  // ---------- the season ----------
  function simulate() {
    const rng = g.mode === "daily" ? seeded(g.day * 104729 + 3) : Math.random;
    const opps = TEAMS.filter((t) => !g.lineup.some((p) => p.t === t));
    const weeks = [];
    for (let w = 1; w <= 17; w++) {
      let me = 0;
      const out = [];
      for (const p of g.lineup) {
        const plays = rng() < Math.min(1, p.gp / Math.max(1, p.tg));
        if (plays) me += Math.max(0, p.ppg * (1 + SWING * gauss(rng)));
        else out.push(p.n.replace(/ (Jr\.|Sr\.|II|III|IV)$/, "").split(" ").slice(-1)[0]);
      }
      const opp = Math.max(40, OPP_MEAN + OPP_SD * gauss(rng));
      weeks.push({ w, me: Math.round(me * 10) / 10, opp: Math.round(opp * 10) / 10, vs: opps[Math.floor(rng() * opps.length)], out });
    }
    return weeks;
  }

  function toSeason() {
    show("p17-season");
    drawLineup(true);
    $("p17-proj").textContent = `Your lineup averages ${g.lineup.reduce((a, p) => a + p.ppg, 0).toFixed(1)} PPR points a week when everyone plays. A typical opponent scores about ${OPP_MEAN.toFixed(0)}.`;
    $("p17-weeks").innerHTML = "";
    $("p17-head").textContent = "Draft complete!";
    $("p17-record").hidden = true;
    $("p17-end").hidden = true;
    $("p17-play").hidden = false;
  }

  $("p17-play").addEventListener("click", () => {
    $("p17-play").hidden = true;
    $("p17-head").textContent = "Your season";
    $("p17-record").textContent = "0-0";
    $("p17-record").hidden = false;
    g.weeks = simulate();
    let w = 0, l = 0, i = 0;
    const list = $("p17-weeks");
    const step = () => {
      const x = g.weeks[i];
      const won = x.me > x.opp;
      won ? w++ : l++;
      list.insertAdjacentHTML("beforeend",
        `<li class="${won ? "win" : "loss"}"><span class="p17-wk">Wk ${x.w}</span><span class="p17-vs">vs ${esc(short(x.vs))} GM` +
        (x.out.length ? `<i>${esc(x.out.join(", "))} out</i>` : "") + `</span>` +
        `<span class="p17-score">${x.me.toFixed(1)}–${x.opp.toFixed(1)}</span><b>${won ? "W" : "L"}</b></li>`);
      $("p17-record").textContent = `${w}-${l}`;
      list.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (++i < 17) setTimeout(step, 230);
      else finish(w, l);
    };
    step();
  });

  function verdict(w) {
    if (w === 17) return ["PERFECT SEASON", "17-0. Frame this lineup."];
    if (w >= 15) return ["SO CLOSE", "A title favorite, but not perfect."];
    if (w >= 12) return ["PLAYOFF LOCK", "Strong team. Perfection needs a little more."];
    if (w >= 9) return ["BUBBLE TEAM", "Sweating out the last week."];
    if (w >= 5) return ["REBUILD", "Time to hit the waiver wire."];
    return ["LAST PLACE", "The punishment is yours to choose."];
  }

  function finish(w, l) {
    const [title, line] = verdict(w);
    $("p17-title").textContent = title;
    $("p17-line").textContent = line;
    $("p17-squares").textContent = squares();
    $("p17-end").hidden = false;
    $("p17-again").textContent = g.mode === "daily" ? "Free play" : "Draft again";
    $("p17-note").textContent = "";
    const s = load(STATS, { played: 0, perfect: 0, best: 0 });
    s.played++; if (w === 17) s.perfect++; s.best = Math.max(s.best, w);
    save(STATS, s);
    $("p17-best").textContent = `Best: ${s.best}-${17 - s.best} · Perfect seasons: ${s.perfect}`;
    if (g.mode === "daily") save(KEY, { day: g.day, lineup: g.lineup.map((p) => p.n), weeks: g.weeks, w, l });
    offerPost(w);
    count(`17-0-${g.mode}-${w}`, "17-0 season");
  }

  function squares() { return g.weeks.map((x) => (x.me > x.opp ? "🟩" : "🟥")).join(""); }

  $("p17-share").addEventListener("click", async () => {
    const w = g.weeks.filter((x) => x.me > x.opp).length;
    const head = g.mode === "daily" ? `17-0 Daily #${g.day}` : "17-0";
    const text = `${head}: I went ${w}-${17 - w} ${w === 17 ? "🏆" : "🏈"}\n${squares()}\n${URL}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); $("p17-note").textContent = "Copied! Paste it anywhere."; }
      count("17-0-share", "17-0 shared");
    } catch (e) {
      if (e && e.name !== "AbortError") $("p17-note").textContent = "Couldn't share. Try again.";
    }
  });

  // ---------- screens ----------
  function show(id) {
    for (const s of ["p17-intro", "p17-draft", "p17-season"]) $(s).hidden = s !== id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function start(mode) {
    g = newGame(mode);
    if (mode === "daily") {
      const done = load(KEY, null);
      if (done && done.day === g.day) {
        g.lineup = done.lineup.map((n) => players.find((p) => p.n === n)).filter(Boolean);
        if (g.lineup.length === 7) {
          g.weeks = done.weeks;
          show("p17-season");
          drawLineup(true);
          $("p17-play").hidden = true;
          $("p17-weeks").innerHTML = g.weeks.map((x) => `<li class="${x.me > x.opp ? "win" : "loss"}"><span class="p17-wk">Wk ${x.w}</span><span class="p17-vs">vs ${esc(short(x.vs))} GM</span><span class="p17-score">${x.me.toFixed(1)}–${x.opp.toFixed(1)}</span><b>${x.me > x.opp ? "W" : "L"}</b></li>`).join("");
          $("p17-record").textContent = `${done.w}-${done.l}`;
          $("p17-record").hidden = false;
          $("p17-head").textContent = "Your season";
          $("p17-proj").textContent = "You already played today's draft. New teams at midnight Eastern.";
          const [title, line] = verdict(done.w);
          $("p17-title").textContent = title; $("p17-line").textContent = line;
          $("p17-squares").textContent = squares();
          $("p17-end").hidden = false;
          $("p17-again").textContent = "Free play";
          offerPost(done.w);
          return;
        }
        g = newGame(mode);
      }
    }
    $("p17-eyebrow").textContent = mode === "daily" ? `DAILY #${g.day}` : "FREE PLAY";
    $("p17-round").textContent = "Round 1 of 7";
    show("p17-draft");
    drawLineup();
    spin();
    count(`17-0-start-${mode}`, "17-0 started");
  }
  $("p17-daily").addEventListener("click", () => start("daily"));
  $("p17-free").addEventListener("click", () => start("free"));
  $("p17-again").addEventListener("click", () => start("free"));

  // ---------- leaderboard ----------
  // Two boards: Daily (today's draft only) and Free play (all-time). Sort by team PPG (default) or record.
  const NAME_KEY = "bhg-17-name", POSTED = "bhg-17-posted", DEVICE = "bhg-17-device";
  let boardMode = "daily", boardSort = "ppg";
  function device() {
    let d = load(DEVICE, null);
    if (!d) {
      d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "");
      save(DEVICE, d);
    }
    return d;
  }
  async function api(path, opts = {}) {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, Object.assign({
      // new-style publishable keys go in the apikey header only (they aren't JWTs)
      headers: Object.assign({ apikey: SUPA_KEY, "Content-Type": "application/json" },
        SUPA_KEY.startsWith("sb_") ? {} : { Authorization: `Bearer ${SUPA_KEY}` }),
    }, opts));
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? null : res.json();
  }
  const BAD = /(fuck|shit|bitch|cunt|nigg|fag|dick|pussy|whore|slut|rape|nazi|retard)/i;
  function cleanName(v) {
    const n = v.replace(/[^A-Za-z0-9 _.'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
    return n.length >= 2 && !BAD.test(n.replace(/[^a-z]/gi, "")) ? n : "";
  }
  const teamPPG = () => Math.round(g.lineup.reduce((a, p) => a + p.ppg, 0) * 10) / 10;

  function offerPost(w) {
    if (!BOARD) return;
    const posted = g.mode === "daily" ? load(POSTED, 0) === g.day : !!g.posted;
    $("p17-post").hidden = posted;
    $("p17-post-label").textContent = g.mode === "daily" ? "Put your record on today's Daily leaderboard" : "Put this team on the Free play leaderboard";
    $("p17-post-note").textContent = posted ? (g.mode === "daily" ? "Your record is on today's leaderboard." : "This team is on the Free play leaderboard.") : "";
    $("p17-name").value = load(NAME_KEY, "") || "";
    $("p17-post-btn").dataset.w = w;
    $("p17-board-link").hidden = false;
  }

  $("p17-post").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = cleanName($("p17-name").value);
    if (!name) { $("p17-post-note").textContent = "Pick a name: 2 to 20 letters or numbers, nothing rude."; return; }
    const btn = $("p17-post-btn");
    btn.disabled = true;
    btn.textContent = "Posting…";
    try {
      await api("rpc/submit_score", { method: "POST", body: JSON.stringify({
        p_mode: g.mode === "daily" ? "daily" : "free", p_day: g.mode === "daily" ? g.day : dayNumber(), p_name: name,
        p_wins: +btn.dataset.w, p_ppg: teamPPG(), p_lineup: g.lineup.map((p) => p.n), p_device: device() }) });
      save(NAME_KEY, name);
      if (g.mode === "daily") save(POSTED, g.day); else g.posted = true;
      $("p17-post").hidden = true;
      $("p17-post-note").textContent = "Posted! Here's where you stand.";
      count(`17-0-posted-${g.mode}`, "17-0 posted to leaderboard");
      openBoard(g.mode === "daily" ? "daily" : "free", name);
    } catch (err) {
      $("p17-post-note").textContent = /slow down/.test(String(err)) ? "Easy there: wait a few seconds and try again." : "Couldn't post right now. Try again in a minute.";
    }
    btn.disabled = false;
    btn.textContent = "Post my record";
  });

  function markChips() {
    for (const b of document.querySelectorAll("#p17-board-modes .filter")) {
      const on = b.dataset.board === boardMode;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const b of document.querySelectorAll("#p17-board-sort .filter")) {
      const on = b.dataset.sort === boardSort;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  let me = "";
  async function openBoard(mode, myName) {
    if (mode) boardMode = mode;
    if (myName !== undefined) me = myName;
    else if (!me) me = load(NAME_KEY, "") || "";
    markChips();
    $("p17-board").hidden = false;
    $("p17-board-day").textContent = boardMode === "daily" ? `Daily #${dayNumber()}` : "All-time";
    $("p17-board-list").innerHTML = `<li class="p17-empty">Loading…</li>`;
    if (mode) $("p17-board").scrollIntoView({ behavior: "smooth", block: "start" });
    const order = boardSort === "ppg" ? "ppg.desc,wins.desc,created_at.asc" : "wins.desc,ppg.desc,created_at.asc";
    const filter = boardMode === "daily" ? `mode=eq.daily&day=eq.${dayNumber()}` : "mode=eq.free";
    try {
      const rows = await api(`leaderboard?${filter}&select=name,wins,ppg,created_at&order=${order}&limit=500`);
      const perfect = rows.filter((r) => r.wins === 17).length;
      $("p17-board-sum").textContent = rows.length
        ? `${rows.length}${rows.length === 500 ? "+" : ""} team${rows.length === 1 ? "" : "s"} posted${boardMode === "daily" ? " today" : ""} · ${perfect} went 17-0`
        : (boardMode === "daily" ? "No one has posted today yet. Be the first." : "No free play teams yet. Be the first.");
      const key = (r) => (boardSort === "ppg" ? `${r.ppg}|${r.wins}` : `${r.wins}|${r.ppg}`);
      let rank = 0, prev = null;
      const ranked = rows.map((r, i) => { const k = key(r); if (k !== prev) { rank = i + 1; prev = k; } return Object.assign({ rank }, r); });
      const mine = me ? ranked.find((r) => r.name === me) : null;
      const top = ranked.slice(0, 25);
      if (mine && !top.includes(mine)) top.push(mine);
      $("p17-board-list").innerHTML = top.map((r) =>
        `<li class="${mine === r ? "me" : ""}${r.wins === 17 ? " perfect" : ""}"><span class="p17-rk">${r.rank}</span>` +
        `<span class="p17-nm">${esc(r.name)}</span>` +
        `<span class="p17-cols"><b class="${boardSort === "ppg" ? "lead" : ""}">${Number(r.ppg).toFixed(1)}<i>PPG</i></b>` +
        `<b class="${boardSort === "wins" ? "lead" : ""}">${r.wins}-${17 - r.wins}</b></span></li>`).join("");
      const hof = await api("leaderboard?wins=eq.17&select=name,day,mode,ppg,created_at&order=created_at.desc&limit=20");
      $("p17-hof").innerHTML = hof.length ? hof.map((r) =>
        `<li><span class="p17-nm">🏆 ${esc(r.name)}</span><span class="p17-hof-day">${r.mode === "free" ? "Free play" : `Daily #${r.day}`} · ${Number(r.ppg).toFixed(1)} PPG</span></li>`).join("")
        : `<li class="p17-empty">Nobody has gone 17-0 yet. Will you be first?</li>`;
    } catch (err) {
      $("p17-board-list").innerHTML = `<li class="p17-empty">Couldn't load the leaderboard. Try again in a minute.</li>`;
    }
  }
  for (const b of document.querySelectorAll("#p17-board-modes .filter")) b.addEventListener("click", () => { boardMode = b.dataset.board; openBoard(); });
  for (const b of document.querySelectorAll("#p17-board-sort .filter")) b.addEventListener("click", () => { boardSort = b.dataset.sort; openBoard(); });
  $("p17-board-link").addEventListener("click", () => openBoard(g && g.mode === "free" ? "free" : "daily"));
  $("p17-board-open").addEventListener("click", () => openBoard("daily"));
  $("p17-board-open").hidden = !BOARD;

  const s = load(STATS, null);
  if (s) $("p17-intro-best").textContent = `Your best: ${s.best}-${17 - s.best} · Perfect seasons: ${s.perfect}`;
})();
