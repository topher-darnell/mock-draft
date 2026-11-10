// Juke: run the ball through 32 angry big-headed GMs.
// Three lanes. Swipe, tap a side, or use the arrow keys to change lanes.

(function () {
  const W = 360, H = 560;              // the field, in game units (the canvas scales to fit)
  const LANES = [W / 6, W / 2, 5 * W / 6];
  const RUNNER_Y = H - 104;
  const PX_PER_YARD = 13;
  const START_SPEED = 250;             // units per second
  const MAX_SPEED = 640;
  const SPEED_UP = 1.07;               // faster by this much every touchdown
  const TD_YARDS = 100;
  const BALL_YARDS = 5;                // bonus for a football
  const SAVE_KEY = "bhg-juke-best";

  const $ = (id) => document.getElementById(id);
  const canvas = $("jk-canvas");
  const ctx = canvas.getContext("2d");
  const HAS_GM = typeof GM !== "undefined";
  const root = (window.BHG && BHG.ROOT) || "../";
  const count = (path, title) => window.BHG && BHG.countEvent(path, title);

  let faces = [];          // { team, tint, pic } for every GM
  let hero = null;         // the runner's head
  let state = "ready";     // ready | running | paused | over
  let g = null;            // the current run
  let last = 0;
  let best = 0;

  try { best = Number(localStorage.getItem(SAVE_KEY)) || 0; } catch (e) { best = 0; }

  // ---------- pictures ----------

  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }

  async function loadArt() {
    hero = await loadImage(root + "icons/mascot-head.png?v=4");
    if (!HAS_GM) return;
    const all = await Promise.all(GM.TEAM_NAMES.map(async (team) => ({
      team, tint: GM.tint(team, 0.85, "#20262E"), pic: await GM.picture(team, "trade"),
    })));
    faces = all.filter((f) => f.pic);
  }

  // sharp on phones: draw at the screen's real pixel size
  function fit() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * scale;
    canvas.height = H * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw();
  }

  // ---------- a run ----------

  function newRun() {
    g = {
      lane: 1, x: LANES[1], speed: START_SPEED, dist: 0, bonus: 0, balls: 0,
      defenders: [], footballs: [], nextRow: 260, lastOpen: 1, step: 0,
      banner: 0, bannerText: "", tds: 0, tackler: null, shake: 0,
    };
  }

  function yards() { return Math.floor(g.dist / PX_PER_YARD) + g.bonus; }

  function spawnRow() {
    // block one or two lanes, always leaving a way through
    const two = Math.random() < Math.min(0.62, 0.3 + g.tds * 0.06);
    const lanes = [0, 1, 2];
    let open;
    if (two) {
      // the gap moves at most one lane from the last gap, so it's always reachable
      const choices = lanes.filter((l) => Math.abs(l - g.lastOpen) <= 1);
      open = choices[Math.floor(Math.random() * choices.length)];
      for (const l of lanes) if (l !== open) addDefender(l);
    } else {
      const blocked = Math.floor(Math.random() * 3);
      addDefender(blocked);
      const free = lanes.filter((l) => l !== blocked);
      open = free[Math.floor(Math.random() * free.length)];
    }
    g.lastOpen = open;
    if (Math.random() < 0.4) g.footballs.push({ lane: open, y: -150, spin: Math.random() * 6 });
    const gap = Math.max(170, 250 - g.tds * 10) + Math.random() * 70;
    g.nextRow = gap;
  }

  function addDefender(lane) {
    const face = faces.length ? faces[Math.floor(Math.random() * faces.length)] : null;
    g.defenders.push({ lane, y: -70, face, sway: Math.random() * 6 });
  }

  function move(dir) {
    if (state !== "running") return;
    g.lane = Math.max(0, Math.min(2, g.lane + dir));
  }

  function update(dt) {
    g.step += dt * g.speed / 26;
    g.dist += g.speed * dt;
    g.x += (LANES[g.lane] - g.x) * Math.min(1, dt * 18);
    if (g.banner > 0) g.banner -= dt;

    g.nextRow -= g.speed * dt;
    if (g.nextRow <= 0) spawnRow();

    for (const d of g.defenders) d.y += g.speed * dt;
    for (const f of g.footballs) { f.y += g.speed * dt; f.spin += dt * 5; }

    // touchdown every 100 yards: everything speeds up
    const tds = Math.floor(yards() / TD_YARDS);
    if (tds > g.tds) {
      g.tds = tds;
      g.speed = Math.min(MAX_SPEED, g.speed * SPEED_UP);
      g.banner = 1.3;
      g.bannerText = "TOUCHDOWN!";
    }

    for (const f of g.footballs) {
      if (!f.got && Math.abs(f.y - RUNNER_Y) < 36 && Math.abs(LANES[f.lane] - g.x) < 44) {
        f.got = true;
        g.balls++;
        g.bonus += BALL_YARDS;
      }
    }
    for (const d of g.defenders) {
      if (Math.abs(d.y - RUNNER_Y) < 42 && Math.abs(LANES[d.lane] - g.x) < 46) return tackled(d);
    }
    g.defenders = g.defenders.filter((d) => d.y < H + 90);
    g.footballs = g.footballs.filter((f) => f.y < H + 40 && !f.got);
  }

  function tackled(d) {
    state = "over";
    g.tackler = d;
    const total = yards();
    const record = total > best;
    if (record) {
      best = total;
      try { localStorage.setItem(SAVE_KEY, String(best)); } catch (e) { /* private window: fine */ }
    }
    const team = d.face ? d.face.team : "";
    const short = team && HAS_GM ? GM.short(team) : "";
    $("jk-tackler").hidden = !team;
    if (team) {
      $("jk-tackler").style.background = GM.tint(team);
      $("jk-tackler").innerHTML = GM.img(team, "happy", 110);
    }
    $("jk-over-title").textContent = record && total > 0 ? "New record!" : "Tackled!";
    const who = short ? `The ${short} GM got you` : "They got you";
    const line = team && HAS_GM && GM.catchphrase(team) ? ` “${GM.catchphrase(team)}”` : "";
    $("jk-over-text").textContent = `${who} after ${total} yards and ${g.tds} touchdown${g.tds === 1 ? "" : "s"}.${line} Best: ${best} yards.`;
    $("jk-share-note").textContent = "";
    $("jk-over").hidden = false;
    $("jk-retry").focus();
    count("juke-done", `Juke run: ${total} yards`);
  }

  // ---------- drawing ----------

  function drawField() {
    ctx.fillStyle = "#17502F";
    ctx.fillRect(0, 0, W, H);
    const dist = g ? g.dist : 0;
    const offset = dist % (PX_PER_YARD * 10);
    // darker bands every five yards, like a mowed field
    const band = PX_PER_YARD * 5;
    ctx.fillStyle = "#14472A";
    for (let b = Math.floor((dist - H) / band); b <= Math.floor(dist / band) + 1; b++) {
      if (((b % 2) + 2) % 2 === 0) ctx.fillRect(0, dist - (b + 1) * band, W, band);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    for (let y = -PX_PER_YARD * 10 + offset; y < H; y += PX_PER_YARD * 10) {
      ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(W - 10, y); ctx.stroke();
    }
    // lane hash marks
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    const hash = dist % (PX_PER_YARD * 2);
    for (const x of [W / 3, 2 * W / 3]) {
      for (let y = -PX_PER_YARD * 2 + hash; y < H; y += PX_PER_YARD * 2) {
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.stroke();
      }
    }
    // sidelines
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(4, 0, 4, H);
    ctx.fillRect(W - 8, 0, 4, H);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  // a little body with running legs, under a big head
  function drawBody(x, y, jersey, pants, step, facingDown) {
    const swing = Math.sin(step) * 7;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x, y + 34, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pants;
    roundRect(x - 13, y + 12 + swing * (facingDown ? -1 : 1), 10, 20, 4);
    roundRect(x + 3, y + 12 - swing * (facingDown ? -1 : 1), 10, 20, 4);
    ctx.fillStyle = jersey;
    roundRect(x - 20, y - 14, 40, 32, 10);
    roundRect(x - 28, y - 12 + swing * 0.6, 10, 22, 5);    // arms
    roundRect(x + 18, y - 12 - swing * 0.6, 10, 22, 5);
  }

  function drawDefender(d) {
    const x = LANES[d.lane], y = d.y;
    const bob = Math.sin(g.step * 0.9 + d.sway) * 2;
    drawBody(x, y, d.face ? d.face.tint : "#3A4656", "#1B222C", g.step + d.sway, true);
    if (d.face) {
      const p = d.face.pic;
      const w = 76, h = w * p.sh / p.sw;
      ctx.drawImage(p.image, p.sx, p.sy, p.sw, p.sh, x - w / 2, y - h + 6 + bob, w, h);
    } else {
      ctx.fillStyle = "#D9A27C";
      ctx.beginPath(); ctx.arc(x, y - 36 + bob, 30, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawRunner() {
    const x = g.x, y = RUNNER_Y;
    const lean = (LANES[g.lane] - g.x) * 0.012;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    drawBody(0, 0, "#F2A93B", "#F4F1EA", g.step, false);
    // the football, tucked
    ctx.fillStyle = "#7A4A22";
    ctx.beginPath(); ctx.ellipse(22, 4, 9, 6, 0.6, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(g.step * 2) * 2;
    const r = 34;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -40 + bob, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#F2A93B"; ctx.fill();
    ctx.clip();
    if (hero) ctx.drawImage(hero, -r, -40 + bob - r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#F2A93B";
    ctx.beginPath(); ctx.arc(0, -40 + bob, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawFootball(f) {
    const x = LANES[f.lane];
    ctx.save();
    ctx.translate(x, f.y);
    ctx.rotate(Math.sin(f.spin) * 0.4);
    ctx.fillStyle = "rgba(242,169,59,0.25)";
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8A5426";
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
    for (const dx of [-4, 0, 4]) { ctx.moveTo(dx, -3); ctx.lineTo(dx, 3); }
    ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.fillStyle = "rgba(10,16,22,0.72)";
    roundRect(12, 12, 132, 58, 14);
    roundRect(W - 122, 12, 110, 58, 14);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#9AA6B4";
    ctx.font = '700 11px "Space Grotesk", Inter, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("YARDS", 24, 32);
    ctx.textAlign = "right";
    ctx.fillText("BEST", W - 24, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = 'italic 900 28px Inter, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(String(yards()), 24, 60);
    ctx.fillStyle = "#F2A93B";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.max(best, yards())), W - 24, 60);

    if (g.banner > 0) {
      const a = Math.min(1, g.banner * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#F2A93B";
      roundRect(30, H / 2 - 120, W - 60, 64, 16);
      ctx.fillStyle = "#1B1206";
      ctx.textAlign = "center";
      ctx.font = 'italic 900 34px Inter, sans-serif';
      ctx.fillText(g.bannerText, W / 2, H / 2 - 76);
      ctx.globalAlpha = 1;
    }
    if (state === "paused") {
      ctx.fillStyle = "rgba(10,16,22,0.7)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = 'italic 900 34px Inter, sans-serif';
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.font = '600 15px Inter, sans-serif';
      ctx.fillText("Tap or press P to keep running", W / 2, H / 2 + 30);
    }
    ctx.textAlign = "left";
  }

  function draw() {
    if (!g) newRun();
    drawField();
    for (const f of g.footballs) drawFootball(f);
    // things farther up the field are drawn first
    const things = [...g.defenders].sort((a, b) => a.y - b.y);
    let runnerDrawn = false;
    for (const d of things) {
      if (!runnerDrawn && d.y > RUNNER_Y) { drawRunner(); runnerDrawn = true; }
      drawDefender(d);
    }
    if (!runnerDrawn) drawRunner();
    drawHud();
  }

  function frame(now) {
    if (state !== "running") return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    if (state === "running") requestAnimationFrame(frame);
  }

  // ---------- controls ----------

  function start() {
    newRun();
    $("jk-start").hidden = true;
    $("jk-over").hidden = true;
    state = "running";
    last = performance.now();
    count("juke-start", "Started a Juke run");
    requestAnimationFrame(frame);
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
    draw();
  }

  function resume() {
    if (state !== "paused") return;
    state = "running";
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function setUpControls() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); move(-1); }
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); move(1); }
      else if (e.key === "p" || e.key === "P") { state === "paused" ? resume() : pause(); }
      else if ((e.key === " " || e.key === "Enter") && state === "paused") { e.preventDefault(); resume(); }
    });

    let startX = null, moved = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (state === "paused") return resume();
      startX = e.clientX; moved = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 26) {          // a swipe: move right away, and allow a second lane in one drag
        move(dx > 0 ? 1 : -1);
        startX = e.clientX;
        moved = true;
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      startX = null;
      if (moved) return;
      const box = canvas.getBoundingClientRect();       // a tap: left or right half
      move(e.clientX < box.left + box.width / 2 ? -1 : 1);
    });
    canvas.addEventListener("pointercancel", () => { startX = null; });
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

    $("jk-go").addEventListener("click", start);
    $("jk-retry").addEventListener("click", start);
    $("jk-share").addEventListener("click", share);
    window.addEventListener("resize", fit);
  }

  async function share() {
    const text = `I ran ${yards()} yards through the big-headed GMs in Juke 🏈 Can you beat it?\nhttps://bigheadgm.com/games/juke.html`;
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        $("jk-share-note").textContent = "Copied. Paste it anywhere.";
      }
      count("juke-shared", "Shared a Juke score");
    } catch (e) {
      if (e && e.name !== "AbortError") $("jk-share-note").textContent = text;
    }
  }

  $("jk-best").textContent = best ? `Your best: ${best} yards` : "";
  setUpControls();
  newRun();
  fit();
  loadArt().then(draw);
})();
