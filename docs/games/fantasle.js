// Fantasle: guess the mystery NFL fantasy player in 8 tries.
// Every guess shows team, division, position, PPR points per game, touchdowns, yards and catches,
// colored green (match), yellow (close) or gray, with arrows for higher/lower.
// Built from the same season stats as the Fantasy page (fantasy_stats.csv), so it updates every week.
// Daily: the same player for everyone, changes at midnight Eastern. Unlimited: a new player every round.

(function () {
  const $ = (id) => document.getElementById(id);
  const RAW = JSON.parse($("pl-data").textContent);
  const MAX = 8;
  const URL = "bigheadgm.com/games/fantasle.html";
  const START = Date.UTC(2026, 10, 10);           // puzzle #1 is November 10, 2026
  const GROUP = { QB: "QB", RB: "skill", WR: "skill", TE: "skill" };
  const count = (path, title) => window.BHG && window.BHG.countEvent(path, title);

  const players = RAW.map((r) => ({ name: r[0], abbr: r[1], team: r[2], div: r[3], pos: r[4], ppg: r[5], td: r[6],
    yds: r[7], rec: r[8], pool: r[9] === 1, slug: r[10], age: r[11] || 0, school: r[2].split(" ").pop() }));
  const byName = new Map(players.map((p) => [p.name, p]));

  // a fixed shuffle of the answer pool, so day N always gives the same player
  function seeded(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pool = players.filter((p) => p.pool).map((p) => p.name).sort();
  const rand = seeded(2026);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const PICKED = { 1: "Jaxon Smith-Njigba" };          // hand-picked days (launch day), by puzzle number

  function eastern(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((x) => [x.type, x.value]));
    return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, min: +parts.minute, s: +parts.second };
  }
  function dayNumber() {
    const e = eastern();
    return Math.floor((Date.UTC(e.y, e.m - 1, e.d) - START) / 864e5) + 1;
  }

  // ---------- saved stuff ----------
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window */ }
  }
  const STATS_KEY = "bhg-fl-stats";
  const DAILY_KEY = "bhg-fl-daily";
  let stats = load(STATS_KEY, { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0, 0, 0], last: 0 });

  // ---------- the game ----------
  let mode = "daily";
  let game = null;          // { day, answer, guesses: [names], done, won }

  function newDaily() {
    const day = dayNumber();
    const saved = load(DAILY_KEY, null);
    if (saved && saved.day === day && byName.has(saved.answer)) return saved;
    const answer = byName.has(PICKED[day]) ? PICKED[day] : pool[((day - 1) % pool.length + pool.length) % pool.length];
    return { day, answer, guesses: [], done: false, won: false };
  }
  function newUnlimited() {
    const answer = pool[Math.floor(Math.random() * pool.length)];
    return { day: 0, answer, guesses: [], done: false, won: false };
  }

  function compare(g, a) {
    // up/down plus a word saying how the MYSTERY player compares to your guess
    const num = (gv, av, near, show, up, down) => {
      const d = Math.round((av - gv) * 10) / 10;
      return { v: show, c: d === 0 ? "g" : Math.abs(d) <= near ? "y" : "x",
        arrow: d > 0 ? "↑" : d < 0 ? "↓" : "", word: d > 0 ? up : d < 0 ? down : "" };
    };
    const age = g.age && a.age ? num(g.age, a.age, 2, g.age, "Older", "Younger") : { v: g.age || "—", c: "x", arrow: "", word: "" };
    return [
      { v: g.abbr, c: g.abbr === a.abbr ? "g" : "x" },
      { v: g.div, c: g.div === a.div ? "g" : g.div.slice(0, 3) === a.div.slice(0, 3) ? "y" : "x" },
      { v: g.pos, c: g.pos === a.pos ? "g" : GROUP[g.pos] === GROUP[a.pos] ? "y" : "x" },
      num(g.ppg, a.ppg, 3, g.ppg.toFixed(1), "Higher", "Lower"),
      num(g.yds, a.yds, 150, g.yds.toLocaleString("en-US"), "More", "Fewer"),
      num(g.td, a.td, 2, g.td, "More", "Fewer"),
      age,
    ];
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function rowHTML(name, animate) {
    const g = byName.get(name), a = byName.get(game.answer);
    const cells = compare(g, a).map((x, i) =>
      `<span class="pl-tile ${x.c}${animate ? " flip" : ""}" style="--i:${i}">${esc(x.v)}${x.arrow && x.c !== "g" ? `<b>${x.arrow}<small>${x.word}</small></b>` : ""}</span>`).join("");
    return `<li class="pl-row${name === game.answer ? " win" : ""}"><span class="pl-guess">${esc(name)}</span><span class="pl-tiles">${cells}</span></li>`;
  }

  function render(animateLast) {
    $("pl-eyebrow").textContent = mode === "daily" ? `DAILY #${game.day}` : "UNLIMITED";
    // oldest guess on top, newest at the bottom (like Wordle)
    $("pl-board").innerHTML = game.guesses.map((n, i) => rowHTML(n, animateLast && i === game.guesses.length - 1)).join("");
    if (animateLast && !game.done) $("pl-input").scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("pl-count").textContent = game.done ? "" : `Guess ${game.guesses.length + 1} of ${MAX}`;
    $("pl-input").disabled = game.done;
    $("pl-input").closest(".pl-search").hidden = game.done;
    $("pl-giveup").hidden = game.done || !game.guesses.length;
    $("pl-done").hidden = !game.done;
    if (game.done) showDone(animateLast);
  }

  function showDone(animate) {
    const a = byName.get(game.answer);
    $("pl-result").textContent = game.won
      ? (game.guesses.length === 1 ? "First try. League winner." : `Got him in ${game.guesses.length}!`)
      : "The mystery player was";
    $("pl-answer").textContent = a.name;
    $("pl-answer").href = `../fantasy/${a.slug}.html`;
    $("pl-meta").textContent = `${a.pos} · ${a.team} · ${a.ppg.toFixed(1)} PPR PPG, ${a.yds.toLocaleString("en-US")} yds, ${a.td} TD` + (a.age ? ` · age ${a.age}` : "");
    const gm = $("pl-gm");
    gm.innerHTML = "";
    if (a.team) {
      gm.dataset.gm = a.team;
      gm.dataset.mood = game.won ? "happy" : "sad";
      gm.dataset.size = "84";
      if (window.BHG) window.BHG.paintGMs(gm.parentNode);
    }
    $("pl-squares").textContent = squares();
    $("pl-next").textContent = mode === "daily" ? "Play unlimited" : "Next player";
    $("pl-share-note").textContent = "";
    if (animate) $("pl-done").classList.add("pop");
    tick();
  }

  function squares() {
    const a = byName.get(game.answer);
    const icon = { g: "🟩", y: "🟨", x: "⬜" };
    return game.guesses.map((n) => compare(byName.get(n), a).map((x) => icon[x.c]).join("")).join("\n");
  }

  function guess(name) {
    if (game.done || !byName.has(name) || game.guesses.includes(name)) return;
    game.guesses.push(name);
    if (name === game.answer) { game.done = true; game.won = true; }
    else if (game.guesses.length >= MAX) game.done = true;
    if (game.done) finish();
    if (mode === "daily") save(DAILY_KEY, game);
    $("pl-input").value = "";
    suggest("");
    render(true);
  }

  function finish() {
    count(`fantasle-${mode}-${game.won ? "win" : "loss"}`, "Fantasle finished");
    if (mode !== "daily") return;
    if (stats.last === game.day) return;
    stats.played++;
    if (game.won) {
      stats.won++;
      stats.dist[game.guesses.length - 1]++;
      stats.streak = stats.last === game.day - 1 ? stats.streak + 1 : 1;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      stats.streak = 0;
    }
    stats.last = game.day;
    save(STATS_KEY, stats);
  }

  // ---------- search box ----------
  let picks = [];
  let active = 0;
  function suggest(text) {
    const q = text.trim().toLowerCase();
    const box = $("pl-suggest");
    if (q.length < 2) { box.hidden = true; picks = []; return; }
    const starts = [], has = [];
    for (const p of players) {
      if (game.guesses.includes(p.name)) continue;
      const n = p.name.toLowerCase();
      if (n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q))) starts.push(p);
      else if (n.includes(q)) has.push(p);
    }
    picks = starts.concat(has).slice(0, 5);
    active = 0;
    box.innerHTML = picks.length ? picks.map((p, i) =>
      `<li role="option" data-i="${i}" class="${i === 0 ? "on" : ""}"><b>${esc(p.name)}</b><span>${p.pos} · ${esc(p.school)}</span></li>`).join("")
      : `<li class="none">No player by that name in our list</li>`;
    box.hidden = false;
  }
  $("pl-input").addEventListener("input", (e) => suggest(e.target.value));
  // when you start typing, move the box near the top of the screen so the names below it aren't
  // hidden by the keyboard (and don't cover your guesses)
  function lift() { $("pl-input").scrollIntoView({ block: "start", behavior: "smooth" }); }
  $("pl-input").addEventListener("focus", () => setTimeout(lift, 250));
  $("pl-input").addEventListener("input", function once() {
    if (this.value.length === 2) lift();
  });
  $("pl-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && picks[active]) { e.preventDefault(); guess(picks[active].name); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!picks.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + picks.length) % picks.length;
      [...$("pl-suggest").children].forEach((li, i) => li.classList.toggle("on", i === active));
    } else if (e.key === "Escape") suggest("");
  });
  $("pl-suggest").addEventListener("mousedown", (e) => {   // mousedown so the input doesn't lose it first
    const li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); guess(picks[+li.dataset.i].name); }
  });

  // ---------- buttons ----------
  $("pl-giveup").addEventListener("click", () => {
    if (game.done) return;
    game.done = true;
    game.won = false;
    finish();
    if (mode === "daily") save(DAILY_KEY, game);
    render(true);
  });

  $("pl-next").addEventListener("click", () => {
    setMode("unlimited", true);
  });

  $("pl-share").addEventListener("click", async () => {
    const head = mode === "daily" ? `Fantasle #${game.day}` : "Fantasle Unlimited";
    const text = `${head} ${game.won ? game.guesses.length : "X"}/${MAX} 🏈\n${squares()}\n${URL}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        $("pl-share-note").textContent = "Copied! Paste it anywhere.";
      }
      count("fantasle-share", "Fantasle shared");
    } catch (e) {
      if (e && e.name !== "AbortError") $("pl-share-note").textContent = "Couldn't share. Try again.";
    }
  });

  function showStats() {
    const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    $("pl-statrow").innerHTML = [["Played", stats.played], ["Win %", pct], ["Streak", stats.streak], ["Best", stats.best]]
      .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    const top = Math.max(1, ...stats.dist);
    $("pl-dist").innerHTML = stats.dist.map((n, i) =>
      `<div class="pl-bar"><span>${i + 1}</span><i style="width:${Math.max(8, (n / top) * 100)}%">${n}</i></div>`).join("");
  }

  function setMode(m, fresh) {
    for (const b of document.querySelectorAll("#pl-modes .filter")) {
      const on = b.dataset.mode === m;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    $("pl-help").hidden = m !== "help";
    $("pl-stats").hidden = m !== "stats";
    $("pl-game").hidden = m === "help" || m === "stats";
    if (m === "stats") showStats();
    if (m === "daily" || m === "unlimited") {
      if (m !== mode || fresh || !game) game = m === "daily" ? newDaily() : newUnlimited();
      mode = m;
      $("pl-done").classList.remove("pop");
      render(false);
    }
  }
  for (const b of document.querySelectorAll("#pl-modes .filter")) {
    b.addEventListener("click", () => {
      const m = b.dataset.mode;
      if (m === "help" || m === "stats") { setMode(m); return; }
      setMode(m, m === "unlimited" && game && game.done && mode === "unlimited");
    });
  }
  $("pl-help-close").addEventListener("click", () => setMode(mode));
  $("pl-stats-close").addEventListener("click", () => setMode(mode));

  // countdown to the next daily player
  function tick() {
    const el = $("pl-countdown");
    if (mode !== "daily" || !game || !game.done) { el.textContent = ""; return; }
    const e = eastern();
    const left = 86400 - (e.h * 3600 + e.min * 60 + e.s);
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    el.textContent = `Next mystery player in ${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  setInterval(tick, 1000);

  game = newDaily();
  setMode("daily");
  if (!load(STATS_KEY, null) && !game.guesses.length) setMode("help");
})();
