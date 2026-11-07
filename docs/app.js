// Big Head GM website

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"];

// Settings: the same ones you tuned in config.py
const NEED_BONUS = [8, 6, 4, 3, 2];  // bonus (in rank spots) for top need, 2nd need, ...
const RANDOMNESS = 7;                // random swing for the top players
const DEEP_RANDOMNESS = 0.4;         // deeper players swing more: rank x this
const LOOK_AHEAD = 15;               // computer only considers this many best-available players
const PICK_DELAY = 350;              // milliseconds between computer picks at Normal speed

// Draft style settings (saved on this device)
const CHAOS_LEVELS = [
  { name: "Chalk", mult: 0.25, hint: "Teams stick close to the big board. Few surprises." },
  { name: "Steady", mult: 0.6, hint: "A little movement, mostly by the board." },
  { name: "Normal", mult: 1, hint: "Like a real draft: some reaches, some players fall." },
  { name: "Wild", mult: 1.7, hint: "Reaches and fallers all over the place." },
  { name: "Chaos", mult: 2.6, hint: "Anything goes. Good luck." },
];
const SPEEDS = [
  { name: "Slow", ms: 800 },
  { name: "Normal", ms: PICK_DELAY },
  { name: "Fast", ms: 120 },
  { name: "Instant", ms: 15 },
];
const SETTINGS_KEY = "bhg-settings";
const settings = { chaos: 2, speed: 1 };   // indexes into the lists above
const VALUE_MIN_MARGIN = 3;          // value labels: cushion for early picks
const VALUE_MARGIN_RATE = 0.12;      // value labels: cushion for later picks
const LABEL_POINTS = { STEAL: 3, Value: 2, Fair: 1, Reach: 0 };  // grade points per pick
const TRADE_WINDOW = 15;             // teams within this many picks of you make offers
const TRADE_UP_PREMIUM = 1.05;       // moving up costs 5% more than the pick is worth

// Data, filled in once the files load
let allPlayers = [];
let allTeams = [];
let baseOrder = [];    // the real draft order, never changed
let draftOrder = [];   // this mock's order (trades change who owns picks)
let tradeChart = {};   // pick number -> points

// What the user has chosen
let myTeam = null;
let rounds = 1;
let currentFilter = "All";

// The draft in progress
let available = [];   // players not drafted yet, best first
let needs = {};       // team name -> list of needs still open
let results = [];     // every pick made so far: { pick, player }
let nextPick = 0;     // index into draftOrder of the pick on the clock
let onClock = false;  // true while you're making a pick
let paused = false;   // true while the trade panel is open
let userPaused = false; // true after you tap Pause
let draftTimer = null;
let tradeTab = "down";
let clockTurns = 0;   // how many times you've been on the clock this draft

// ---------- Big-head GMs (drawn by gm.js) ----------

const HAS_GM = typeof GM !== "undefined";   // the site still works if gm.js is missing

// A GM on a tile in their team color
function avatar(teamName, mood, size, extraClass) {
  if (!HAS_GM) return "";
  return `<span class="avatar ${extraClass || ""}" style="background:${GM.tint(teamName)}">${GM.img(teamName, mood, size)}</span>`;
}

function gmName(teamName) {
  return HAS_GM ? `${GM.short(teamName)} GM` : teamName;
}

function quip(kind) {
  return HAS_GM ? GM.quip(kind) : "";
}

function moodForLabel(label) {
  if (label === "Reach") return "sad";
  if (label === "Fair") return "neutral";
  return "happy";   // STEAL and Value
}

function moodForGrade(grade) {
  if (grade === "A" || grade === "B") return "happy";
  if (grade === "C") return "neutral";
  return "sad";
}

// Your GM in the top corner of the draft screen
function setMyGM(mood) {
  const box = document.getElementById("my-gm");
  if (!HAS_GM || !myTeam) {
    box.innerHTML = "";
    return;
  }
  box.style.background = GM.tint(myTeam);
  box.innerHTML = GM.img(myTeam, mood, 64, "", gmName(myTeam));
}

// A status line with a GM next to it
function statusWithGM(teamName, mood, html, className) {
  const status = document.getElementById("status");
  status.className = "status " + (className || "");
  status.innerHTML = `<div class="status-row">${avatar(teamName, mood, 40)}<div class="status-text">${html}</div></div>`;
}

// ---------- Share my draft: a picture of your class to text or post ----------

let lastResult = null;   // { me, mine, of } from the last finished draft
let shareBlob = null;

const GRADE_COLORS = { A: "#6CD39A", B: "#5FB3F9", C: "#B4BFCC", D: "#F2A93B", F: "#F2876B" };
const LABEL_COLORS = {
  STEAL: ["rgba(108,211,154,0.18)", "#6CD39A"], Value: ["rgba(95,179,249,0.18)", "#5FB3F9"],
  Fair: ["#222A35", "#B4BFCC"], Reach: ["rgba(242,135,107,0.18)", "#F2876B"],
};

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);   // draw the card without it
    im.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

// shorten text with "…" so it fits a width
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

async function drawShareCard() {
  const { me, mine, of } = lastResult;
  const W = 1080, H = 1350, ORANGE = "#F2A93B";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  try {
    await Promise.all([
      document.fonts.load('italic 900 60px Inter'), document.fonts.load('700 40px "Space Grotesk"'),
      document.fonts.load('600 30px Inter'), document.fonts.load('700 30px Inter'),
    ]);
  } catch (e) { /* fall back to system fonts */ }
  const [head, gm] = await Promise.all([
    loadImage("icons/mascot-head.png"),
    HAS_GM ? loadImage(GM.url(myTeam, moodForGrade(me.grade))) : Promise.resolve(null),
  ]);

  // background with a stadium-light glow
  ctx.fillStyle = "#10151C";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 160, 120, 0, W - 160, 120, 700);
  glow.addColorStop(0, "rgba(242,169,59,0.22)");
  glow.addColorStop(1, "rgba(242,169,59,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // header: logo tile + BIG HEAD GM
  const X = 72;
  if (head) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(X, 64, 88, 88, 20); ctx.clip();
    ctx.drawImage(head, X, 64, 88, 88);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
  ctx.font = 'italic 900 56px Inter, sans-serif';
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("BIG HEAD", X + 112, 126);
  ctx.fillStyle = ORANGE;
  ctx.fillText(" GM", X + 112 + ctx.measureText("BIG HEAD").width, 126);
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillStyle = "#9AA6B4";
  ctx.fillText(`2027 MOCK DRAFT · ${rounds} ${rounds === 1 ? "ROUND" : "ROUNDS"}`, X + 114, 156);

  // grade card: GM, grade letter, team, standing
  const cy = 200, ch = 300;
  roundRect(ctx, X - 8, cy, W - 2 * (X - 8), ch, 36, "#1A212B");
  if (gm) {
    roundRect(ctx, X + 16, cy + 24, 216, ch - 24, 26, HAS_GM ? GM.tint(myTeam) : "#222A35");
    ctx.save();
    ctx.beginPath(); ctx.roundRect(X + 16, cy + 24, 216, ch - 24, 26); ctx.clip();
    ctx.drawImage(gm, X + 16 + 4, cy + ch - 250, 208, 250);
    ctx.restore();
  }
  const gx = gm ? X + 264 : X + 24;
  roundRect(ctx, gx, cy + 40, 140, 140, 32, GRADE_COLORS[me.grade] || ORANGE);
  ctx.font = '700 100px "Space Grotesk", sans-serif';
  ctx.fillStyle = "#10151C";
  ctx.textAlign = "center";
  ctx.fillText(me.grade, gx + 70, cy + 145);
  ctx.textAlign = "left";
  const tx = gx + 168, tw = W - X - tx - 8;
  let size = 44;   // shrink long team names before cutting them off
  do { ctx.font = `700 ${size}px "Space Grotesk", sans-serif`; size -= 2; } while (size >= 32 && ctx.measureText(myTeam).width > tw);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(fitText(ctx, myTeam, tw), tx, cy + 92);
  ctx.font = '600 28px Inter, sans-serif';
  ctx.fillStyle = "#9AA6B4";
  ctx.fillText(`${me.place} of ${of} teams`, tx, cy + 136);
  ctx.fillText(`${me.avg.toFixed(2)} points per pick`, tx, cy + 174);
  if (HAS_GM) {
    ctx.font = 'italic 600 28px Inter, sans-serif';
    ctx.fillStyle = ORANGE;
    const kind = moodForGrade(me.grade) === "happy" ? "gradeHigh" : moodForGrade(me.grade) === "neutral" ? "gradeMid" : "gradeLow";
    ctx.fillText(fitText(ctx, `“${quip(kind)}”`, W - X - gx - 8), gx, cy + 248);
  }

  // your class
  let y = cy + ch + 70;
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillStyle = "#9AA6B4";
  ctx.fillText("MY CLASS", X, y);
  y += 22;
  const maxRows = 9;
  const rowH = 74;
  for (const r of mine.slice(0, maxRows)) {
    ctx.fillStyle = "#1F2732";
    ctx.fillRect(X, y, W - 2 * X, 2);
    const base = y + 48;
    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = "#9AA6B4";
    ctx.fillText(`#${r.pick.pick}`, X, base);
    const [bg, fg] = LABEL_COLORS[r.label] || LABEL_COLORS.Fair;
    ctx.font = '700 24px Inter, sans-serif';
    const lw = ctx.measureText(r.label).width + 28;
    roundRect(ctx, W - X - lw, y + 18, lw, 40, 10, bg);
    ctx.fillStyle = fg;
    ctx.fillText(r.label, W - X - lw + 14, y + 47);
    const nx = X + 104, nw = W - X - lw - 24 - nx;
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillStyle = "#FFFFFF";
    const name = fitText(ctx, r.player.name, nw * 0.62);
    ctx.fillText(name, nx, base);
    const after = nx + ctx.measureText(name).width + 14;
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillStyle = "#9AA6B4";
    ctx.fillText(fitText(ctx, `${r.player.position} · ${r.player.college}`, nx + nw - after), after, base);
    y += rowH;
  }
  if (mine.length > maxRows) {
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillStyle = "#9AA6B4";
    ctx.fillText(`+ ${mine.length - maxRows} more picks`, X, y + 40);
  }

  // footer
  roundRect(ctx, 0, H - 110, W, 110, 0, ORANGE);
  ctx.font = 'italic 900 40px Inter, sans-serif';
  ctx.fillStyle = "#1B1206";
  ctx.textAlign = "center";
  ctx.fillText("MAKE YOUR DRAFT AT BIGHEADGM.COM", W / 2, H - 42);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function shareFileName() {
  return `big-head-gm-${(HAS_GM ? GM.short(myTeam) : myTeam).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-mock.png`;
}

async function openShareSheet() {
  if (!lastResult) return;
  const sheet = document.getElementById("share-sheet");
  const preview = document.getElementById("share-preview");
  document.getElementById("share-status").textContent = "Making your picture…";
  preview.removeAttribute("src");
  sheet.hidden = false;
  document.getElementById("close-share").focus();
  shareBlob = await drawShareCard();
  if (!shareBlob) {
    document.getElementById("share-status").textContent = "Couldn't make the picture on this device.";
    return;
  }
  if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
  preview.dataset.url = URL.createObjectURL(shareBlob);
  preview.src = preview.dataset.url;
  const file = new File([shareBlob], shareFileName(), { type: "image/png" });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  document.getElementById("share-native").hidden = !canShare;
  document.getElementById("share-status").textContent = canShare ? "" : "Save it, then post it anywhere.";
}

async function shareNative() {
  if (!shareBlob) return;
  const file = new File([shareBlob], shareFileName(), { type: "image/png" });
  try {
    await navigator.share({ files: [file], text: "My Big Head GM mock draft. Make yours at https://bigheadgm.com" });
  } catch (e) { /* cancelled */ }
}

function saveShareImage() {
  if (!shareBlob) return;
  const a = document.createElement("a");
  a.href = document.getElementById("share-preview").dataset.url;
  a.download = shareFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function closeShareSheet() {
  document.getElementById("share-sheet").hidden = true;
}

function setUpShare() {
  document.getElementById("share-button").addEventListener("click", openShareSheet);
  document.getElementById("close-share").addEventListener("click", closeShareSheet);
  document.getElementById("share-native").addEventListener("click", shareNative);
  document.getElementById("share-save").addEventListener("click", saveShareImage);
  document.getElementById("share-sheet").addEventListener("click", (e) => { if (e.target.id === "share-sheet") closeShareSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.getElementById("share-sheet").hidden) closeShareSheet(); });
}

// ---------- My mocks: your last 10 drafts, saved on this device ----------

const MOCKS_KEY = "bhg-mocks";
const MAX_MOCKS = 10;
let openMockId = null;

function loadMocks() {
  try {
    const list = JSON.parse(localStorage.getItem(MOCKS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];   // private browsing or storage turned off
  }
}

function storeMocks(list) {
  try {
    localStorage.setItem(MOCKS_KEY, JSON.stringify(list));
  } catch (e) {
    // can't save here; the draft still works
  }
}

function saveMock(me, mine, teamCount) {
  const mock = {
    id: Date.now(),
    date: new Date().toISOString(),
    team: myTeam,
    rounds,
    style: CHAOS_LEVELS[settings.chaos].name,
    grade: me.grade,
    place: me.place,
    of: teamCount,
    avg: Math.round(me.avg * 100) / 100,
    picks: mine.map((r) => ({
      pick: r.pick.pick, name: r.player.name, pos: r.player.position,
      college: r.player.college, rank: r.player.rank, label: r.label,
    })),
  };
  storeMocks([mock, ...loadMocks()].slice(0, MAX_MOCKS));
}

function mockDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderMyMocks() {
  const mocks = loadMocks();
  const section = document.getElementById("my-mocks");
  section.hidden = mocks.length === 0;
  const list = document.getElementById("mock-list");
  list.innerHTML = "";
  for (const m of mocks) {
    const button = document.createElement("button");
    button.className = "mock-card";
    button.setAttribute("aria-label", `${m.team} mock, grade ${m.grade}, ${mockDate(m.date)}`);
    const first = m.picks.slice(0, 2).map((p) => `#${p.pick} ${p.name}`).join(" · ");
    button.innerHTML = `
      ${avatar(m.team, moodForGrade(m.grade), 46)}
      <span class="mock-text">
        <span class="mock-team">${HAS_GM ? GM.short(m.team) : m.team}</span>
        <span class="mock-meta">${mockDate(m.date)} · ${m.rounds} ${m.rounds === 1 ? "round" : "rounds"}</span>
        <span class="mock-picks">${first}${m.picks.length > 2 ? ` +${m.picks.length - 2}` : ""}</span>
      </span>
      <span class="grade-small grade-${m.grade.toLowerCase()}">${m.grade}</span>`;
    button.addEventListener("click", () => openMock(m.id));
    list.appendChild(button);
  }
}

function openMock(id) {
  const m = loadMocks().find((x) => x.id === id);
  if (!m) return;
  openMockId = id;
  document.getElementById("mock-title").textContent = m.team;
  document.getElementById("mock-body").innerHTML = `
    <div class="mock-summary">
      <span class="grade-letter grade-${m.grade.toLowerCase()}">${m.grade}</span>
      <span class="meta">${m.avg.toFixed(2)} points per pick · ${m.place} of ${m.of}<br>${mockDate(m.date)} · ${m.rounds} ${m.rounds === 1 ? "round" : "rounds"}${m.style && m.style !== "Normal" ? " · " + m.style : ""}</span>
    </div>
    <ol class="board mock-class">
      ${m.picks.map((p) => `
        <li class="player">
          <span class="rank">#${p.pick}</span>
          <div class="info">
            <span class="name">${p.name}</span>
            <span class="meta">${p.pos} · ${p.college} · rank ${p.rank}</span>
          </div>
          <span class="label-pill ${p.label.toLowerCase()}">${p.label}</span>
        </li>`).join("")}
    </ol>
    <div class="mock-buttons">
      <button class="secondary" id="delete-mock">Delete</button>
      <button class="start" id="redo-mock">Draft as the ${HAS_GM ? GM.short(m.team) : m.team} again</button>
    </div>`;
  document.getElementById("delete-mock").addEventListener("click", () => {
    storeMocks(loadMocks().filter((x) => x.id !== id));
    closeMock();
    renderMyMocks();
  });
  document.getElementById("redo-mock").addEventListener("click", () => {
    closeMock();
    rounds = m.rounds;
    openSetup(m.team);
  });
  document.getElementById("mock-sheet").hidden = false;
  document.getElementById("close-mock").focus();
}

function closeMock() {
  document.getElementById("mock-sheet").hidden = true;
  openMockId = null;
}

function setUpMyMocks() {
  document.getElementById("close-mock").addEventListener("click", closeMock);
  document.getElementById("mock-sheet").addEventListener("click", (e) => { if (e.target.id === "mock-sheet") closeMock(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openMockId !== null) closeMock(); });
  document.getElementById("clear-mocks").addEventListener("click", () => {
    if (!confirm("Delete all your saved mocks?")) return;
    storeMocks([]);
    renderMyMocks();
  });
}

// ---------- Home page, and moving between it and the draft ----------

const APP_SCREENS = ["setup-screen", "draft-screen", "results-screen"];

function currentAppScreen() {
  return APP_SCREENS.find((id) => !document.getElementById(id).hidden) || "setup-screen";
}

// Home -> the app. Adds one history step, so the phone's Back button comes back home.
function enterApp(screenId) {
  if (!(history.state && history.state.app)) history.pushState({ app: true }, "");
  document.getElementById("home-screen").hidden = true;
  document.getElementById("app").hidden = false;
  if (screenId) {
    for (const id of APP_SCREENS) document.getElementById(id).hidden = id !== screenId;
  }
  window.scrollTo(0, 0);
}

// Start fresh on the setup screen (optionally with a team already picked)
function openSetup(teamName) {
  if (teamName) myTeam = teamName;
  enterApp("setup-screen");
  renderSetup();
}

// Leaving mid-draft pauses it, so no picks happen while you're away
function pauseForHome() {
  const draftRunning = !document.getElementById("draft-screen").hidden &&
    !document.getElementById("action-bar").hidden;
  if (!draftRunning || onClock || userPaused) return;
  clearTimeout(draftTimer);
  userPaused = true;
  updatePauseButton();
  statusWithGM(myTeam, "neutral", `<b>Paused</b><span class="status-quote">Tap Resume to keep drafting.</span>`);
}

// fromBack: the browser puts you back where you were on the page, so don't jump to the top
function showHome(fromBack) {
  if (!document.getElementById("app").hidden) pauseForHome();
  document.getElementById("app").hidden = true;
  document.getElementById("home-screen").hidden = false;
  renderResume();
  renderMyMocks();
  if (!fromBack) window.scrollTo(0, 0);
}

// From the setup screen's logo: same as the Back button
function goHome() {
  if (history.state && history.state.app) {
    history.back();   // the popstate listener shows the home page
  } else {
    showHome();
  }
}

// "Back to your draft" on the home page, if you left one going
function renderResume() {
  const button = document.getElementById("resume-button");
  const screen = currentAppScreen();
  const started = myTeam && screen !== "setup-screen";
  button.hidden = !started;
  if (started) {
    button.textContent = screen === "results-screen" ? "Back to your grades" : `Back to your ${HAS_GM ? GM.short(myTeam) : myTeam} draft`;
  }
}

function renderHome() {
  renderMyMocks();
  document.getElementById("hero-stats").textContent =
    `${allPlayers.length} prospects · ${baseOrder.length} picks · ${allTeams.length} GMs`;

  // a GM in each "How it works" step
  for (const box of document.querySelectorAll(".step-gm")) {
    if (!HAS_GM) {
      box.innerHTML = "";
      continue;
    }
    box.style.background = GM.tint(box.dataset.gm);
    box.innerHTML = GM.img(box.dataset.gm, box.dataset.mood, 84);
  }

  // every team: tap one to set up a draft as that team
  const grid = document.getElementById("home-teams");
  grid.innerHTML = "";
  const sorted = [...allTeams].sort((a, b) => a.name.localeCompare(b.name));
  for (const team of sorted) {
    const button = document.createElement("button");
    button.className = "home-team";
    const short = HAS_GM ? GM.short(team.name) : team.name;
    button.setAttribute("aria-label", `Draft as the ${team.name}`);
    button.innerHTML = `
      ${avatar(team.name, "neutral", 60)}
      <span class="home-team-name${short.length > 9 ? " long" : ""}">${short}</span>
      <span class="home-team-picks">${roundOnePicks(team.name) || "No 1st"}</span>`;
    button.addEventListener("click", () => openSetup(team.name));
    if (HAS_GM) {
      // the GM cheers when you point at him
      button.addEventListener("pointerenter", () => { button.querySelector("img").src = GM.url(team.name, "happy"); });
      button.addEventListener("pointerleave", () => { button.querySelector("img").src = GM.url(team.name, "neutral"); });
    }
    grid.appendChild(button);
  }
}

function setUpHome() {
  setUpMyMocks();
  setUpShare();
  for (const button of document.querySelectorAll("[data-start]")) {
    button.addEventListener("click", () => openSetup());
  }
  document.getElementById("how-button").addEventListener("click", () => {
    document.getElementById("how").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("brand-top").addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("resume-button").addEventListener("click", () => enterApp(null));
  document.getElementById("app-home").addEventListener("click", goHome);

  // Back and Forward buttons
  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.app) {
      enterApp(null);   // Forward: back where you were
    } else {
      showHome(true);
    }
  });
  // a reload always starts on the home page
  if (history.state && history.state.app) history.replaceState(null, "");
}

// ---------- Screen 1: pick your team ----------

function roundOnePicks(teamName) {
  const picks = baseOrder.filter((p) => p.round === 1 && p.team === teamName);
  return picks.map((p) => "#" + p.pick).join(", ");
}

function renderTeams() {
  const grid = document.getElementById("team-grid");
  grid.innerHTML = "";
  const sorted = [...allTeams].sort((a, b) => a.name.localeCompare(b.name));
  for (const team of sorted) {
    const button = document.createElement("button");
    button.className = team.name === myTeam ? "team selected" : "team";
    button.innerHTML = `
      ${avatar(team.name, "neutral", 46)}
      <span class="team-text">
        <span class="team-name">${team.name}</span>
        <span class="team-picks">${roundOnePicks(team.name) || "No 1st-round pick"}</span>
      </span>`;
    button.addEventListener("click", () => {
      myTeam = team.name;
      renderSetup();
    });
    grid.appendChild(button);
  }
}

function renderRounds() {
  const box = document.getElementById("rounds");
  box.innerHTML = "";
  for (let n = 1; n <= 7; n++) {
    const button = document.createElement("button");
    button.textContent = n;
    button.className = n === rounds ? "round selected" : "round";
    button.setAttribute("aria-label", n === 1 ? "1 round" : n + " rounds");
    button.addEventListener("click", () => {
      rounds = n;
      renderSetup();
    });
    box.appendChild(button);
  }
}

// ---------- Draft style: how predictable the computer is, and how fast it picks ----------

function chaosMult() { return CHAOS_LEVELS[settings.chaos].mult; }
function pickDelay() { return SPEEDS[settings.speed].ms; }

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (Number.isInteger(saved.chaos) && CHAOS_LEVELS[saved.chaos]) settings.chaos = saved.chaos;
    if (Number.isInteger(saved.speed) && SPEEDS[saved.speed]) settings.speed = saved.speed;
  } catch (e) { /* use the defaults */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* not saved */ }
}

function renderSettings() {
  const slider = document.getElementById("chaos");
  slider.value = settings.chaos + 1;
  const level = CHAOS_LEVELS[settings.chaos];
  document.getElementById("chaos-value").textContent = level.name;
  document.getElementById("chaos-hint").textContent = level.hint;
  slider.setAttribute("aria-valuetext", level.name);
  slider.style.setProperty("--fill", `${(settings.chaos / (CHAOS_LEVELS.length - 1)) * 100}%`);

  const box = document.getElementById("speed");
  box.innerHTML = "";
  SPEEDS.forEach((sp, i) => {
    const button = document.createElement("button");
    button.textContent = sp.name;
    button.className = i === settings.speed ? "round selected" : "round";
    button.setAttribute("aria-pressed", i === settings.speed ? "true" : "false");
    button.addEventListener("click", () => {
      settings.speed = i;
      saveSettings();
      renderSettings();
    });
    box.appendChild(button);
  });
}

function setUpSettings() {
  loadSettings();
  document.getElementById("chaos").addEventListener("input", (e) => {
    settings.chaos = Number(e.target.value) - 1;
    saveSettings();
    renderSettings();
  });
}

// the style shown on the draft screen and saved with your mock (blank when Normal)
function styleTag() {
  return settings.chaos === 2 ? "" : CHAOS_LEVELS[settings.chaos].name.toUpperCase();
}

function renderSetup() {
  renderTeams();
  renderRounds();
  renderSettings();
  const start = document.getElementById("start-button");
  if (myTeam) {
    start.disabled = false;
    start.textContent = HAS_GM ? `Start draft as the ${gmName(myTeam)}` : `Start draft as the ${myTeam}`;
  } else {
    start.disabled = true;
    start.textContent = "Pick a team to start";
  }
}

function startDraft() {
  document.getElementById("setup-screen").hidden = true;
  document.getElementById("draft-screen").hidden = false;
  document.getElementById("draft-eyebrow").textContent =
    `${rounds} ${rounds === 1 ? "ROUND" : "ROUNDS"}${styleTag() ? " · " + styleTag() : ""} · YOUR PICKS: ${roundOnePicks(myTeam) || "none in round 1"}`;
  document.getElementById("draft-title").textContent = myTeam;

  // fresh copies, so a new mock always starts clean
  available = [...allPlayers];
  needs = {};
  for (const team of allTeams) {
    needs[team.name] = [...team.needs];
  }
  results = [];
  nextPick = 0;
  onClock = false;
  paused = false;
  clockTurns = 0;
  setMyGM("neutral");
  document.getElementById("action-bar").hidden = false;
  draftOrder = baseOrder.map((p) => ({ ...p }));   // fresh copy, so trades don't carry over

  renderFilters();
  renderBoard();
  renderFeed();
  window.scrollTo(0, 0);

  if (draftOrder[0].team === myTeam) {
    userPaused = false;
    runDraft();          // you pick first: you're on the clock right away
    return;
  }

  userPaused = true;     // wait for you to tap Start, so you can trade up before pick 1
  updatePauseButton();
  statusWithGM(myTeam, "neutral", `<b>Ready when you are.</b><span class="status-quote">Tap Start to begin, or Trade to move up first.</span>`);
}

// ---------- The draft ----------

// Same idea as cpu_pick in draft_logic.py: lowest score wins
function cpuPick(teamName) {
  const mult = chaosMult();
  const candidates = available.slice(0, Math.round(LOOK_AHEAD * Math.max(1, mult)));
  const teamNeeds = needs[teamName];
  let best = null;
  let bestScore = Infinity;

  for (const p of candidates) {
    let bonus = 0;
    const idx = teamNeeds.indexOf(p.position);
    if (idx !== -1) {
      bonus = idx < NEED_BONUS.length ? NEED_BONUS[idx] : 1;
    }
    const swing = Math.max(RANDOMNESS, p.rank * DEEP_RANDOMNESS) * mult;
    const score = p.rank - bonus + (Math.random() * 2 - 1) * swing;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// Same as value_label in draft_logic.py
function valueLabel(pickNumber, rank) {
  const diff = pickNumber - rank;   // positive = player fell
  const margin = Math.max(VALUE_MIN_MARGIN, Math.round(pickNumber * VALUE_MARGIN_RATE));
  if (diff >= margin * 2) return "STEAL";
  if (diff >= margin) return "Value";
  if (diff > -margin) return "Fair";
  return "Reach";
}

function makePick(pick, player) {
  available = available.filter((p) => p !== player);
  const label = valueLabel(pick.pick, player.rank);
  let score = LABEL_POINTS[label];
  let filledNeed = false;

  const teamNeeds = needs[pick.team];
  const idx = teamNeeds.indexOf(player.position);
  if (idx !== -1) {
    teamNeeds.splice(idx, 1);   // need filled
    score += 1;                 // bonus point for filling a need
    filledNeed = true;
  }
  results.push({ pick, team: pick.team, player, label, score, filledNeed });
  nextPick++;
  renderFeed();
  renderBoard();
}

// Computer teams pick one at a time until it's your turn or the draft ends
// ---------- Pause ----------

function updatePauseButton() {
  const button = document.getElementById("pause-button");
  if (userPaused) {
    button.textContent = results.length === 0 ? "Start" : "Resume";
  } else {
    button.textContent = "Pause";
  }
  button.className = userPaused ? "secondary paused" : "secondary";
  button.disabled = onClock;   // the draft already waits for you when you're on the clock
}

function togglePause() {
  if (onClock) return;
  userPaused = !userPaused;
  updatePauseButton();
  const status = document.getElementById("status");
  if (userPaused) {
    clearTimeout(draftTimer);
    statusWithGM(myTeam, "neutral", `<b>Paused</b><span class="status-quote">Tap Resume to keep drafting.</span>`);
  } else {
    scheduleNext(200);
  }
}

// Waits, then makes the next pick (cancels any pick already waiting)
function scheduleNext(delay) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(runDraft, delay);
}

function runDraft() {
  if (paused || userPaused) return;   // trade panel is open, or you tapped Pause
  const pick = draftOrder[nextPick];
  const status = document.getElementById("status");

  if (!pick || pick.round > rounds) {
    showDraftComplete();
    return;
  }

  if (pick.team === myTeam) {
    onClock = true;
    updatePauseButton();
    showOnTheClock(pick);
    renderBoard();
    return;   // wait for you to tap a Draft button
  }

  statusWithGM(pick.team, "focused", `<b>Pick ${pick.pick} · ${pick.team}</b><span class="status-quote">On the clock…</span>`);
  makePick(pick, cpuPick(pick.team));
  scheduleNext(pickDelay());
}

// ---------- Your pick ----------

function showOnTheClock(pick) {
  const status = document.getElementById("status");
  status.className = "status on-clock";
  const via = pick.from ? `from ${pick.from}` : "";
  const chips = needs[myTeam]
    .map((need, i) => `<span class="${i === 0 ? "chip top" : "chip"}">${need}</span>`)
    .join("");
  clockTurns++;
  const line = HAS_GM ? (clockTurns === 1 ? GM.catchphrase(myTeam) : quip("clock")) : "";
  status.innerHTML = `
    <div class="clock-body">
      <div class="clock-main">
        <div class="clock-row">
          <span class="clock-label">ON THE CLOCK · PICK ${pick.pick}</span>
        </div>
        <div class="clock-team">${myTeam}</div>
        ${via ? `<div class="clock-via">${via}</div>` : ""}
        <div class="chips">${chips || '<span class="chip">All needs filled</span>'}</div>
        ${line ? `<p class="clock-quote">${line}</p>` : ""}
      </div>
      ${HAS_GM ? `<div class="clock-gm">${GM.img(myTeam, "focused", 92, "", gmName(myTeam))}</div>` : ""}
    </div>`;
  setMyGM("focused");

  // Best available player at each of your needs (first 3)
  const hints = document.getElementById("hints");
  hints.innerHTML = "";
  for (const need of needs[myTeam].slice(0, 3)) {
    const best = available.find((p) => p.position === need);
    if (!best) continue;
    const card = document.createElement("div");
    card.className = "hint";
    card.innerHTML = `
      <span class="hint-pos">${need}</span>
      <span class="hint-name">${best.name}</span>
      <span class="hint-meta">#${best.rank} ${best.college}</span>`;
    hints.appendChild(card);
  }
  hints.hidden = hints.children.length === 0;
  status.scrollIntoView({ behavior: "smooth", block: "start" });
}

function userPick(player) {
  if (!onClock) return;
  onClock = false;
  document.getElementById("hints").hidden = true;
  const pick = draftOrder[nextPick];
  makePick(pick, player);
  updatePauseButton();

  // your GM reacts to the pick before the draft moves on
  const label = results[results.length - 1].label;
  const mood = moodForLabel(label);
  const kind = { STEAL: "steal", Value: "value", Fair: "fair", Reach: "reach" }[label];
  setMyGM(mood);
  statusWithGM(myTeam, mood,
    `<b>You took ${player.name} at #${pick.pick} · <span class="label ${label.toLowerCase()}">${label}</span></b><span class="status-quote">${quip(kind)}</span>`,
    "reaction");
  scheduleNext(1600);
}

// ---------- Trades ----------

function value(pick) {
  return tradeChart[pick.pick];
}

// Same as build_package in trades.py: add the smallest pick that closes
// the gap, so nobody overpays by much
function buildPackage(pool, needed) {
  pool = [...pool];
  const pkg = [];
  let total = 0;
  while (total < needed && pool.length > 0) {
    const gap = needed - total;
    const closers = pool.filter((p) => value(p) >= gap);
    let extra;
    if (closers.length > 0) {
      extra = closers.reduce((a, b) => (value(a) <= value(b) ? a : b));
    } else {
      extra = pool.reduce((a, b) => (value(a) >= value(b) ? a : b));
    }
    pkg.push(extra);
    pool = pool.filter((p) => p !== extra);
    total += value(extra);
  }
  return { pkg, total };
}

// Teams picking soon after you offer their pick plus extras to match yours
function findTradeOffers(myPick) {
  const myValue = value(myPick);
  const offers = [];
  const seen = new Set();

  for (const p of draftOrder) {
    if (p.pick <= myPick.pick) continue;
    if (p.pick > myPick.pick + TRADE_WINDOW) break;
    if (p.team === myTeam || seen.has(p.team)) continue;
    seen.add(p.team);

    const theirOthers = draftOrder.filter((x) => x.team === p.team && x.pick > p.pick && x.round <= rounds);
    const extras = buildPackage(theirOthers, myValue - value(p));
    const total = value(p) + extras.total;
    if (total >= myValue) {
      offers.push({ team: p.team, picks: [p, ...extras.pkg], total });
    }
    if (offers.length === 3) break;
  }
  return offers;
}

// Your pick goes to them, their picks come to you
function makeTrade(myPick, offer) {
  myPick.from = myPick.from || myTeam;
  myPick.team = offer.team;
  for (const p of offer.picks) {
    p.from = p.from || offer.team;
    p.team = myTeam;
  }
}

function openTradeSheet() {
  paused = true;               // stop the draft while you look at trades
  clearTimeout(draftTimer);
  setMyGM("trade");
  tradeTab = onClock ? "down" : "up";
  renderTradeSheet();
  document.getElementById("trade-sheet").hidden = false;
}

function closeTradeSheet() {
  document.getElementById("trade-sheet").hidden = true;
  setMyGM(onClock ? "focused" : "neutral");
  paused = false;
  if (!onClock && !userPaused) scheduleNext(pickDelay());   // pick up where the draft left off
}

function renderTradeSheet() {
  document.getElementById("tab-down").className = tradeTab === "down" ? "tab active" : "tab";
  document.getElementById("tab-up").className = tradeTab === "up" ? "tab active" : "tab";
  if (tradeTab === "down") {
    renderTradeDown();
  } else {
    renderTradeUp();
  }
}

function renderTradeDown() {
  const worth = document.getElementById("trade-worth");
  const box = document.getElementById("trade-offers");
  box.innerHTML = "";

  if (!onClock) {
    document.getElementById("trade-title").textContent = "Trade down";
    worth.innerHTML = "";
    box.innerHTML = '<p class="meta">You can trade down when you\'re on the clock.</p>';
    return;
  }

  const myPick = draftOrder[nextPick];
  const myValue = value(myPick);
  const offers = findTradeOffers(myPick);
  document.getElementById("trade-title").textContent = `Trade down from #${myPick.pick}`;
  worth.innerHTML = `<span>Your pick is worth</span><b>${Math.round(myValue).toLocaleString()} pts</b>`;

  if (offers.length === 0) {
    box.innerHTML = '<p class="meta">No teams want to trade up right now.</p>';
  }
  for (const offer of offers) {
    const diff = Math.round(offer.total - myValue);
    const card = document.createElement("div");
    card.className = "offer";
    card.innerHTML = `
      <div class="offer-top">
        <span class="offer-who">${avatar(offer.team, "trade", 40)}<span class="offer-team">${offer.team}</span></span>
        <span class="offer-diff">+${diff}</span>
      </div>
      <div class="offer-picks">${offer.picks.map((p) => `<span class="offer-pick">#${p.pick}</span>`).join("")}</div>
      <div class="offer-bottom">
        <span class="meta">${Math.round(offer.total).toLocaleString()} pts total</span>
      </div>`;
    const accept = document.createElement("button");
    accept.className = "accept-button";
    accept.textContent = "Accept";
    accept.addEventListener("click", () => acceptTrade(myPick, offer));
    card.querySelector(".offer-bottom").appendChild(accept);
    box.appendChild(card);
  }
}

// Picks coming up before your next one that you could move up to
function renderTradeUp() {
  const worth = document.getElementById("trade-worth");
  const box = document.getElementById("trade-offers");
  box.innerHTML = "";
  document.getElementById("trade-title").textContent = "Trade up";

  const inDraft = (p) => p.round <= rounds;
  let myNextIndex = draftOrder.findIndex((p, i) => i >= nextPick && p.team === myTeam && inDraft(p));
  if (myNextIndex === -1) myNextIndex = draftOrder.length;

  if (myNextIndex === nextPick) {
    worth.innerHTML = "";
    box.innerHTML = '<p class="meta">You\'re already on the clock. Nothing to move up to.</p>';
    return;
  }

  const myNext = draftOrder[myNextIndex];
  worth.innerHTML = myNext
    ? `<span>Your next pick is #${myNext.pick}</span><b>${Math.round(value(myNext)).toLocaleString()} pts</b>`
    : "<span>You have no more picks in this draft</span>";

  const targets = draftOrder.slice(nextPick, myNextIndex).filter(inDraft).slice(-8);   // the 8 picks right before yours
  for (const target of targets) {
    const myPool = draftOrder.filter((p) => p.team === myTeam && p.pick > target.pick && inDraft(p));
    const cost = value(target) * TRADE_UP_PREMIUM;
    const { pkg, total } = buildPackage(myPool, cost);
    const affordable = total >= cost;

    const card = document.createElement("div");
    card.className = affordable ? "offer" : "offer unaffordable";
    card.innerHTML = `
      <div class="offer-top">
        <span class="offer-who">${avatar(target.team, "trade", 40)}<span class="offer-team">#${target.pick} · ${target.team}</span></span>
        <span class="meta">${Math.round(value(target)).toLocaleString()} pts</span>
      </div>
      <div class="offer-bottom">
        <span class="meta">${affordable ? "You give " + pkg.map((p) => "#" + p.pick).join(", ") : "Not enough picks"}</span>
      </div>`;
    if (affordable) {
      const accept = document.createElement("button");
      accept.className = "accept-button";
      accept.textContent = "Move up";
      accept.addEventListener("click", () => acceptTradeUp(target, pkg));
      card.querySelector(".offer-bottom").appendChild(accept);
    }
    box.appendChild(card);
  }
}

function showTradeMessage(text) {
  setMyGM("happy");
  statusWithGM(myTeam, "happy", `<b>${text}</b><span class="status-quote">${quip("tradeDone")}</span>`, "traded");
}

function acceptTrade(myPick, offer) {
  makeTrade(myPick, offer);
  document.getElementById("trade-sheet").hidden = true;
  onClock = false;
  paused = false;
  userPaused = false;
  updatePauseButton();
  document.getElementById("hints").hidden = true;
  showTradeMessage(`Trade! #${myPick.pick} to ${offer.team} for ${offer.picks.map((p) => "#" + p.pick).join(", ")}`);
  renderBoard();
  scheduleNext(1500);   // pause so you can read the trade
}

function acceptTradeUp(target, pkg) {
  const other = target.team;
  target.from = target.from || other;
  target.team = myTeam;
  for (const p of pkg) {
    p.from = p.from || myTeam;
    p.team = other;
  }
  document.getElementById("trade-sheet").hidden = true;
  paused = false;
  userPaused = false;
  updatePauseButton();
  showTradeMessage(`Trade! You move up to #${target.pick}, sending ${pkg.map((p) => "#" + p.pick).join(", ")} to ${other}`);
  scheduleNext(1500);
}

function showDraftComplete() {
  document.getElementById("action-bar").hidden = true;
  statusWithGM(myTeam, "neutral", `<b>Draft complete</b><span class="status-quote">Grading every team…</span>`);
  setTimeout(showResults, 900);
}

// ---------- Screen 3: grades ----------

function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Same curve as show_grades in draft_logic.py
function gradeTeams() {
  const byTeam = {};
  for (const r of results) {
    if (!byTeam[r.team]) byTeam[r.team] = [];
    byTeam[r.team].push(r.score);
  }

  const teams = Object.keys(byTeam).map((name) => ({
    name,
    avg: average(byTeam[name]),
    picks: byTeam[name].length,
  }));
  teams.sort((a, b) => b.avg - a.avg);

  teams.forEach((t, i) => {
    const spot = i / teams.length;   // 0 = best, close to 1 = worst
    if (spot < 0.20) t.grade = "A";
    else if (spot < 0.45) t.grade = "B";
    else if (spot < 0.75) t.grade = "C";
    else if (spot < 0.92) t.grade = "D";
    else t.grade = "F";
    t.place = i + 1;
  });
  return teams;
}

function showResults() {
  const teams = gradeTeams();
  const me = teams.find((t) => t.name === myTeam);
  const mine = results.filter((r) => r.team === myTeam);

  document.getElementById("results-eyebrow").textContent =
    `DRAFT COMPLETE · ${rounds} ${rounds === 1 ? "ROUND" : "ROUNDS"}`;
  document.getElementById("my-team-name").textContent = myTeam;

  const gradeGM = document.getElementById("grade-gm");
  const quote = document.getElementById("grade-quote");
  const myMood = me ? moodForGrade(me.grade) : "neutral";
  gradeGM.innerHTML = HAS_GM ? GM.img(myTeam, myMood, 100, "", gmName(myTeam)) : "";
  gradeGM.hidden = !HAS_GM;
  const kind = myMood === "happy" ? "gradeHigh" : myMood === "neutral" ? "gradeMid" : "gradeLow";
  quote.textContent = me && HAS_GM ? `“${quip(kind)}”` : "";
  quote.hidden = !quote.textContent;

  if (me) {
    const needsFilled = mine.filter((r) => r.filledNeed).length;
    document.getElementById("my-grade").textContent = me.grade;
    document.getElementById("my-grade").className = `grade-letter grade-${me.grade.toLowerCase()}`;
    document.getElementById("my-grade-detail").innerHTML =
      `${me.avg.toFixed(2)} points per pick<br>${me.place} of ${teams.length} · ${needsFilled} ${needsFilled === 1 ? "need" : "needs"} filled`;
    saveMock(me, mine, teams.length);
    lastResult = { me, mine, of: teams.length };
  } else {
    lastResult = null;
    document.getElementById("my-grade").textContent = "–";
    document.getElementById("my-grade-detail").textContent = "You had no picks in these rounds.";
  }

  // Your class
  const classList = document.getElementById("my-class");
  classList.innerHTML = "";
  for (const r of mine) {
    const li = document.createElement("li");
    li.className = "player";
    li.innerHTML = `
      <span class="rank">#${r.pick.pick}</span>
      <div class="info">
        <span class="name">${r.player.name}</span>
        <span class="meta">${r.player.position} · ${r.player.college} · rank ${r.player.rank}</span>
      </div>
      <span class="label-pill ${r.label.toLowerCase()}">${r.label}</span>`;
    classList.appendChild(li);
  }

  // All teams
  const all = document.getElementById("all-grades");
  all.innerHTML = "";
  for (const t of teams) {
    const li = document.createElement("li");
    li.className = t.name === myTeam ? "grade-row mine" : "grade-row";
    li.innerHTML = `
      ${avatar(t.name, moodForGrade(t.grade), 30)}
      <span class="grade-small grade-${t.grade.toLowerCase()}">${t.grade}</span>
      <span class="grade-row-name">${t.name}</span>
      <span class="grade-row-avg">${t.avg.toFixed(2)}</span>`;
    all.appendChild(li);
  }

  document.getElementById("share-button").hidden = !lastResult;
  document.getElementById("draft-screen").hidden = true;
  document.getElementById("results-screen").hidden = false;
  window.scrollTo(0, 0);
}

function viewPicks() {
  document.getElementById("results-screen").hidden = true;
  document.getElementById("draft-screen").hidden = false;
  window.scrollTo(0, 0);
}

function newMock() {
  document.getElementById("results-screen").hidden = true;
  document.getElementById("draft-screen").hidden = true;
  document.getElementById("setup-screen").hidden = false;
  currentFilter = "All";
  renderSetup();
  window.scrollTo(0, 0);
}

// Every pick so far, left to right, oldest first.
// Only new picks get added, so long drafts stay fast on phones.
function renderFeed() {
  const ticker = document.getElementById("feed");

  if (results.length === 0) {
    ticker.innerHTML = '<div class="tick empty">Picks show up here</div>';
    ticker.dataset.count = "0";
    return;
  }

  let shown = Number(ticker.dataset.count || 0);
  if (shown === 0) ticker.innerHTML = "";

  for (let i = shown; i < results.length; i++) {
    const { pick, team, player, label } = results[i];
    const card = document.createElement("div");
    card.className = team === myTeam ? "tick mine" : "tick";
    card.innerHTML = `
      ${avatar(team, moodForLabel(label), 32)}
      <span class="tick-text">
        <span class="tick-top">${pick.pick} · ${HAS_GM ? GM.short(team) : team}</span>
        <span class="tick-name">${player.name}</span>
        <span class="tick-bottom">${player.position} · <span class="label ${label.toLowerCase()}">${label}</span></span>
      </span>`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `More about ${player.name}`);
    card.addEventListener("click", () => openPlayerCard(player));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayerCard(player); } });
    ticker.appendChild(card);
  }
  ticker.dataset.count = String(results.length);

  // slide to the newest pick: on the right on phones, at the bottom on desktop
  ticker.scrollLeft = ticker.scrollWidth;
  ticker.scrollTop = ticker.scrollHeight;
}

// ---------- Screen 2: the big board ----------

function renderFilters() {
  const box = document.getElementById("filters");
  box.innerHTML = "";
  for (const pos of POSITIONS) {
    const button = document.createElement("button");
    button.textContent = pos;
    button.className = pos === currentFilter ? "filter active" : "filter";
    button.addEventListener("click", () => {
      currentFilter = pos;
      renderFilters();
      renderBoard();
    });
    box.appendChild(button);
  }
}

function renderBoard() {
  const pool = available.length ? available : allPlayers;
  let shown = pool;
  if (currentFilter !== "All") {
    shown = pool.filter((p) => p.position === currentFilter);
  }

  const label = document.getElementById("board-label");
  label.textContent = currentFilter === "All" ? "BIG BOARD" : `${currentFilter} · ${shown.length} PLAYERS`;

  const board = document.getElementById("board");
  board.innerHTML = "";
  for (const p of shown) {
    const li = document.createElement("li");
    li.className = "player";
    const isNeed = onClock && needs[myTeam].includes(p.position);
    li.innerHTML = `
      <span class="rank">${p.rank}</span>
      <button class="info player-open" aria-label="More about ${p.name}">
        <span class="name">${p.name}</span>
        <span class="meta">${p.position} · ${p.college}</span>
      </button>
      ${isNeed ? '<span class="need-tag">NEED</span>' : ""}`;
    li.querySelector(".player-open").addEventListener("click", () => openPlayerCard(p));

    if (onClock) {
      const button = document.createElement("button");
      button.className = "draft-button";
      button.textContent = "Draft";
      button.addEventListener("click", () => userPick(p));
      li.appendChild(button);
    }
    board.appendChild(li);
  }
}

// ---------- Player cards ----------

let cardWasPaused = false;   // was the draft already stopped when the card opened?

function feetInches(h) {
  const [ft, inch] = String(h || "").split("-");
  return ft && inch !== undefined ? `${ft}'${inch}"` : (h || "—");
}

function openPlayerCard(player) {
  // stop the draft while you read, like the trade panel
  cardWasPaused = paused;
  paused = true;
  clearTimeout(draftTimer);
  renderPlayerCard(player);
  document.getElementById("player-sheet").hidden = false;
  document.getElementById("close-player").focus();
}

function closePlayerCard() {
  document.getElementById("player-sheet").hidden = true;
  paused = cardWasPaused;
  const draftRunning = !document.getElementById("draft-screen").hidden && !document.getElementById("action-bar").hidden;
  if (draftRunning && !paused && !onClock && !userPaused) scheduleNext(pickDelay());
}

function renderPlayerCard(player) {
  const samePos = allPlayers.filter((q) => q.position === player.position);   // best first
  const posRank = samePos.indexOf(player) + 1;
  const taken = results.find((r) => r.player === player);
  const swing = Math.max(RANDOMNESS, player.rank * DEEP_RANDOMNESS) * chaosMult();
  const low = Math.max(1, Math.round(player.rank - swing));
  const high = Math.round(player.rank + swing);

  document.getElementById("pc-rank").textContent = `#${player.rank}`;
  document.getElementById("pc-name").textContent = player.name;
  document.getElementById("pc-meta").textContent = `${player.position}${posRank} · ${player.college}`;

  const facts = [
    ["Big board", `#${player.rank}`],
    ["At ${pos}".replace("${pos}", player.position), `${posRank} of ${samePos.length}`],
    ["Class", player.year || "—"],
    ["Height", feetInches(player.height)],
    ["Weight", player.weight ? `${player.weight} lb` : "—"],
    ["Usually goes", `#${low}–${high}`],
  ];

  // the top players at his position, with him highlighted
  const start = Math.max(0, Math.min(posRank - 3, samePos.length - 6));
  const top = samePos.slice(start, start + 6);
  const best = top[0].rank;
  const bars = top.map((q) => {
    const width = Math.max(12, Math.round(100 * Math.sqrt(best / q.rank)));
    const gone = results.find((r) => r.player === q);
    const note = gone ? `#${gone.pick.pick} ${HAS_GM ? GM.short(gone.team) : gone.team}` : `#${q.rank}`;
    return `
      <li class="pc-bar${q === player ? " me" : ""}${gone ? " gone" : ""}">
        <span class="pc-bar-name">${player.position}${samePos.indexOf(q) + 1} · ${q.name}</span>
        <span class="pc-bar-track"><span style="width:${width}%"></span></span>
        <span class="pc-bar-note">${note}</span>
      </li>`;
  }).join("");

  // during a draft: who's picking soon that needs this position
  let soon = "";
  if (!taken && results.length && nextPick < draftOrder.length) {
    const upcoming = [];
    for (let i = nextPick; i < draftOrder.length && upcoming.length < 3; i++) {
      const pk = draftOrder[i];
      if (pk.round > rounds || pk.team === myTeam) continue;
      if ((needs[pk.team] || []).includes(player.position)) upcoming.push(pk);
    }
    soon = upcoming.length
      ? `<p class="pc-soon"><b>Next teams that need a ${player.position}:</b> ${upcoming.map((pk) => `#${pk.pick} ${HAS_GM ? GM.short(pk.team) : pk.team}`).join(", ")}</p>`
      : `<p class="pc-soon">No team picking soon lists ${player.position} as a need.</p>`;
  }

  const status = taken
    ? `<p class="pc-taken">Drafted #${taken.pick.pick} by the ${taken.team} · <span class="label ${taken.label.toLowerCase()}">${taken.label}</span></p>`
    : "";

  const canDraft = onClock && !taken && available.includes(player);

  document.getElementById("pc-body").innerHTML = `
    ${status}
    <dl class="pc-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <h3 class="pc-label">TOP ${player.position}s ON THE BOARD</h3>
    <ol class="pc-bars">${bars}</ol>
    ${soon}
    ${canDraft ? `<button class="start" id="pc-draft">Draft ${player.name}</button>` : ""}`;

  if (canDraft) {
    document.getElementById("pc-draft").addEventListener("click", () => {
      document.getElementById("player-sheet").hidden = true;
      paused = cardWasPaused;
      userPick(player);
    });
  }
}

// ---------- Load everything ----------

async function loadJSON(path) {
  const response = await fetch(path);
  return response.json();
}

async function start() {
  allPlayers = await loadJSON("data/players.json");
  allTeams = await loadJSON("data/teams.json");
  baseOrder = await loadJSON("data/draft_order.json");
  draftOrder = baseOrder;
  tradeChart = await loadJSON("data/trade_chart.json");

  document.getElementById("subtitle").textContent =
    `${allPlayers.length} prospects · ${draftOrder.length} picks`;
  document.getElementById("start-button").addEventListener("click", startDraft);
  setUpSettings();
  document.getElementById("view-picks-button").addEventListener("click", viewPicks);
  document.getElementById("new-mock-button").addEventListener("click", newMock);
  document.getElementById("trade-button").addEventListener("click", openTradeSheet);
  document.getElementById("pause-button").addEventListener("click", togglePause);
  document.getElementById("close-trade").addEventListener("click", closeTradeSheet);
  document.getElementById("close-player").addEventListener("click", closePlayerCard);
  document.getElementById("player-sheet").addEventListener("click", (e) => { if (e.target.id === "player-sheet") closePlayerCard(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.getElementById("player-sheet").hidden) closePlayerCard(); });
  document.getElementById("tab-down").addEventListener("click", () => { tradeTab = "down"; renderTradeSheet(); });
  document.getElementById("tab-up").addEventListener("click", () => { tradeTab = "up"; renderTradeSheet(); });
  renderSetup();
  renderHome();
}

setUpHome();

start();
