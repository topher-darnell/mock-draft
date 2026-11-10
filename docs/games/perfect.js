// 17-0: draft a PPR fantasy lineup one random NFL team at a time, then play a 17-week season.
// Each round spins a team; you take one of its players for an open slot (stats stay hidden).
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
      `<li><button class="p17-pick" data-i="${i}"><span class="p17-pos p-${p.p}">${p.p}</span><b>${esc(p.n)}</b></button></li>`).join("");
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
          (reveal ? `<span class="ff-ppg"><b>${p.ppg.toFixed(1)}</b><span>PPR PPG</span></span>` : "")
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
    $("p17-record").textContent = "0-0";
    $("p17-end").hidden = true;
    $("p17-play").hidden = false;
  }

  $("p17-play").addEventListener("click", () => {
    $("p17-play").hidden = true;
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
          $("p17-proj").textContent = "You already played today's draft. New teams at midnight Eastern.";
          const [title, line] = verdict(done.w);
          $("p17-title").textContent = title; $("p17-line").textContent = line;
          $("p17-squares").textContent = squares();
          $("p17-end").hidden = false;
          $("p17-again").textContent = "Free play";
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

  const s = load(STATS, null);
  if (s) $("p17-intro-best").textContent = `Your best: ${s.best}-${17 - s.best} · Perfect seasons: ${s.perfect}`;
})();
