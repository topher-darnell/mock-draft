// Draft Day Blitz: 20 prospects, 7 picks, 4 seconds each, rankings hidden.
// The daily challenge deals everyone the same cards (the date picks them).

(function () {
  const CARDS = 20;
  const PICKS = 7;
  const SECONDS = 4;
  const NEED_BONUS = 1.25;          // players at a team need are worth 25% more
  const FIRST_DAY = new Date(2026, 10, 9);   // challenge #1 was November 9, 2026
  const SAVE_KEY = "bhg-blitz";
  // how many cards come from each part of the board: [first rank, last rank, cards]
  const TIERS = [[1, 20, 4], [21, 60, 5], [61, 110, 6], [111, 170, 5]];
  const GRADES = [[95, "A+"], [90, "A"], [85, "A-"], [80, "B+"], [75, "B"], [70, "B-"], [65, "C+"], [60, "C"], [55, "C-"], [45, "D"], [0, "F"]];

  const $ = (id) => document.getElementById(id);
  const root = (window.BHG && BHG.ROOT) || "../";
  const count = (path, title) => window.BHG && BHG.countEvent(path, title);

  let players = [];
  let game = null;       // the round being played
  let timer = null;      // animation frame for the countdown bar

  // ---------- saved results (this phone only) ----------

  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
  }
  function store(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private window: fine */ }
  }

  // ---------- dealing ----------

  function dayNumber() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - FIRST_DAY) / 86400000) + 1;
  }

  // a small random-number maker that gives the same numbers for the same seed
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function value(player, needs) {
    const base = 3000 / (player.rank + 20);
    return Math.round(base * (needs.includes(player.position) ? NEED_BONUS : 1));
  }

  function deal(random) {
    const deck = [];
    for (const [from, to, n] of TIERS) {
      const tier = players.filter((p) => p.rank >= from && p.rank <= to);
      deck.push(...shuffle(tier, random).slice(0, n));
    }
    shuffle(deck, random);
    // three needs, each with at least two cards in the deck so they matter
    const counts = {};
    for (const p of deck) counts[p.position] = (counts[p.position] || 0) + 1;
    const options = shuffle(Object.keys(counts).filter((k) => counts[k] >= 2).sort(), random);
    const needs = options.slice(0, 3);
    return { deck, needs };
  }

  // ---------- one round ----------

  function startGame(daily) {
    const day = dayNumber();
    const random = daily ? seeded(20261109 + day * 7919) : Math.random;
    const { deck, needs } = deal(random);
    game = { daily, day, deck, needs, at: 0, mine: [], log: [], over: false };
    $("bz-intro").hidden = true;
    $("bz-done").hidden = true;
    $("bz-play").hidden = false;
    $("bz-eyebrow").textContent = daily ? `DAILY CHALLENGE #${day}` : "FREE PLAY";
    $("bz-needs").innerHTML = `Needs: <b>${needs.join(" · ")}</b>`;
    count(daily ? "blitz-daily-start" : "blitz-free-start", "Started Draft Day Blitz");
    showCard();
  }

  function picksLeft() { return PICKS - game.mine.length; }
  function cardsLeft() { return game.deck.length - game.at; }

  function renderRoster() {
    let html = "";
    for (let i = 0; i < PICKS; i++) {
      const p = game.mine[i];
      html += p ? `<li class="got">${p.position}<span>#${p.rank}</span></li>` : `<li>${i + 1}</li>`;
    }
    $("bz-roster").innerHTML = html;
    const left = picksLeft();
    $("bz-picks").textContent = `${left} pick${left === 1 ? "" : "s"} left`;
    $("bz-left").textContent = `Card ${Math.min(game.at + 1, CARDS)} of ${CARDS}`;
  }

  function feet(h) {
    const [ft, inch] = String(h || "").split("-");
    return ft && inch !== undefined ? `${ft}'${inch}"` : "";
  }

  function showCard() {
    cancelAnimationFrame(timer);
    if (picksLeft() === 0 || cardsLeft() === 0) return finish();
    renderRoster();
    const p = game.deck[game.at];
    const forced = cardsLeft() <= picksLeft();     // not enough cards left to pass
    const card = $("bz-card");
    const size = [feet(p.height), p.weight ? `${p.weight} lb` : "", p.year || ""].filter(Boolean).join(" · ");
    card.className = "bz-card";
    card.style.transform = "";
    card.style.opacity = "";
    card.innerHTML = `
      <span class="bz-stamp yes">DRAFT</span><span class="bz-stamp no">PASS</span>
      <span class="bz-tags"><span class="bz-pos">${p.position}</span>${game.needs.includes(p.position) ? '<span class="bz-need">TEAM NEED</span>' : ""}</span>
      <h2 class="bz-name">${p.name}</h2>
      <span class="bz-school">${p.college}</span>
      <span class="bz-size">${size}</span>`;
    card.setAttribute("aria-label", `${p.name}, ${p.position}, ${p.college}. ${forced ? "You have to draft him." : "Draft or pass?"}`);
    $("bz-pass").disabled = forced;
    $("bz-pass").textContent = forced ? "No passes left" : "← Pass";
    runTimer(forced);
  }

  function runTimer(forced) {
    const bar = $("bz-time");
    const started = performance.now();
    let pausedAt = 0, pausedFor = 0;
    const tick = (now) => {
      if (document.hidden) { if (!pausedAt) pausedAt = now; timer = requestAnimationFrame(tick); return; }
      if (pausedAt) { pausedFor += now - pausedAt; pausedAt = 0; }
      const left = 1 - (now - started - pausedFor) / (SECONDS * 1000);
      bar.style.transform = `scaleX(${Math.max(0, left)})`;
      bar.classList.toggle("low", left < 0.3);
      if (left <= 0) return decide(forced, true);   // time's up: a pass (or a forced pick)
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }

  function decide(draft, timedOut) {
    if (!game || game.over || game.busy) return;
    const forced = cardsLeft() <= picksLeft();
    if (forced) draft = true;
    cancelAnimationFrame(timer);
    game.busy = true;
    const p = game.deck[game.at];
    game.log.push({ player: p, drafted: draft, timedOut: !!timedOut && !draft });
    if (draft) game.mine.push(p);
    game.at++;
    const card = $("bz-card");
    card.classList.add("fly");
    card.style.transform = `translateX(${draft ? 130 : -130}%) rotate(${draft ? 16 : -16}deg)`;
    card.style.opacity = "0";
    card.querySelector(draft ? ".yes" : ".no").style.opacity = "1";
    renderRoster();
    setTimeout(() => { game.busy = false; showCard(); }, 230);
  }

  // ---------- the result ----------

  function gradeFor(percent) {
    return GRADES.find(([min]) => percent >= min)[1];
  }

  function finish() {
    cancelAnimationFrame(timer);
    game.over = true;
    const v = (p) => value(p, game.needs);
    const mine = game.mine.reduce((sum, p) => sum + v(p), 0);
    const bestSeven = [...game.deck].sort((a, b) => v(b) - v(a)).slice(0, PICKS);
    const best = bestSeven.reduce((sum, p) => sum + v(p), 0);
    const percent = Math.round(100 * mine / best);
    const grade = gradeFor(percent);
    const hits = game.mine.filter((p) => bestSeven.includes(p)).length;

    $("bz-play").hidden = true;
    $("bz-done").hidden = false;
    $("bz-letter").textContent = grade;
    $("bz-score").textContent = `${percent}% of the best possible class`;
    $("bz-detail").textContent = `You found ${hits} of the 7 best players in the deck. Needs were ${game.needs.join(", ")}.`;

    // one square per card, in the order they came up
    const seen = game.log.map((e) => {
      const top = bestSeven.includes(e.player);
      if (e.drafted) return top ? "🟩" : "🟨";
      return top ? "🟥" : "⬜";
    });
    game.squares = seen.join("");
    game.summary = { percent, grade };
    $("bz-squares").textContent = game.squares;

    const row = (p, chip) => `
      <li class="bb-row${bestSeven.includes(p) ? " best" : ""}">
        <span class="bb-rank">#${p.rank}</span>
        <span class="bb-text"><a class="bb-name" href="${root}players/${slug(p.name)}.html">${p.name}</a>
          <span class="bb-meta">${p.position} · ${p.college}${game.needs.includes(p.position) ? " · need" : ""}</span></span>
        ${chip}
      </li>`;
    $("bz-class").innerHTML = game.mine.map((p) =>
      row(p, bestSeven.includes(p) ? '<span class="bz-chip good">Great pick</span>' : `<span class="bz-chip">${v(p)} pts</span>`)).join("");
    const passed = game.deck.filter((p) => !game.mine.includes(p)).sort((a, b) => v(b) - v(a)).slice(0, 6);
    const sawIt = (p) => game.log.some((e) => e.player === p);
    $("bz-missed").innerHTML = passed.map((p) =>
      row(p, bestSeven.includes(p) ? `<span class="bz-chip bad">${sawIt(p) ? "Missed" : "Never came up"}</span>` : `<span class="bz-chip">${v(p)} pts</span>`)).join("");

    // remember the daily result (first try counts) and the best free-play score
    const saved = load();
    if (game.daily) {
      if (saved.day !== game.day) {
        saved.streak = saved.day === game.day - 1 ? (saved.streak || 0) + 1 : 1;
        saved.day = game.day;
        saved.percent = percent;
        saved.grade = grade;
      }
    } else {
      saved.best = Math.max(saved.best || 0, percent);
    }
    store(saved);
    $("bz-again").textContent = game.daily ? "Free play" : "Play again";
    $("bz-share-note").textContent = "";
    count(game.daily ? "blitz-daily-done" : "blitz-free-done", `Finished Draft Day Blitz: ${grade}`);
    window.scrollTo(0, 0);
  }

  function slug(name) {
    return name.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function share() {
    const label = game.daily ? `Draft Day Blitz #${game.day}` : "Draft Day Blitz";
    const text = `${label}: ${game.summary.grade} (${game.summary.percent}%)\n${game.squares}\nhttps://bigheadgm.com/games/blitz.html`;
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        $("bz-share-note").textContent = "Copied. Paste it anywhere.";
      }
      count("blitz-shared", "Shared a Blitz result");
    } catch (e) {
      if (e && e.name !== "AbortError") $("bz-share-note").textContent = text;
    }
  }

  // ---------- intro ----------

  function showIntro() {
    cancelAnimationFrame(timer);
    game = null;
    $("bz-play").hidden = true;
    $("bz-done").hidden = true;
    $("bz-intro").hidden = false;
    $("bz-eyebrow").textContent = "DRAFT DAY BLITZ";
    const saved = load();
    const day = dayNumber();
    const bits = [];
    if (saved.day === day) {
      $("bz-daily").textContent = `Today's challenge again (you got ${saved.grade})`;
      bits.push(`Today: ${saved.grade}, ${saved.percent}%`);
    } else {
      $("bz-daily").textContent = `Play today's challenge (#${day})`;
    }
    if (saved.streak > 1 && saved.day >= day - 1) bits.push(`${saved.streak}-day streak`);
    if (saved.best) bits.push(`Free play best: ${saved.best}%`);
    $("bz-record").textContent = bits.join(" · ");
  }

  // ---------- swiping ----------

  function setUpSwipe() {
    const card = $("bz-card");
    let startX = null, dx = 0;
    card.addEventListener("pointerdown", (e) => {
      if (!game || game.busy) return;
      startX = e.clientX; dx = 0;
      card.classList.remove("back");
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener("pointermove", (e) => {
      if (startX === null) return;
      dx = e.clientX - startX;
      const forced = cardsLeft() <= picksLeft();
      if (forced && dx < 0) dx = dx / 5;       // can't pass: the card resists
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.querySelector(".yes").style.opacity = Math.min(1, Math.max(0, dx / 90));
      card.querySelector(".no").style.opacity = Math.min(1, Math.max(0, -dx / 90));
    });
    const end = () => {
      if (startX === null) return;
      startX = null;
      if (dx > 80) return decide(true);
      if (dx < -80 && cardsLeft() > picksLeft()) return decide(false);
      card.classList.add("back");
      card.style.transform = "";
      card.querySelector(".yes").style.opacity = 0;
      card.querySelector(".no").style.opacity = 0;
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  async function start() {
    try {
      players = await fetch(root + "data/players.json").then((r) => r.json());
    } catch (e) {
      $("bz-record").textContent = "Couldn't load the players. Check your connection and refresh.";
      $("bz-daily").disabled = true;
      $("bz-free").disabled = true;
      return;
    }
    $("bz-daily").addEventListener("click", () => startGame(true));
    $("bz-free").addEventListener("click", () => startGame(false));
    $("bz-draft").addEventListener("click", () => decide(true));
    $("bz-pass").addEventListener("click", () => decide(false));
    $("bz-again").addEventListener("click", () => startGame(false));
    $("bz-share").addEventListener("click", share);
    document.addEventListener("keydown", (e) => {
      if (!game || game.over || $("bz-play").hidden) return;
      if (e.key === "ArrowRight") { e.preventDefault(); decide(true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); decide(false); }
    });
    setUpSwipe();
    showIntro();
  }

  start();
})();
