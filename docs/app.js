// Mock Draft website

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"];

// Settings: the same ones you tuned in config.py
const NEED_BONUS = [8, 6, 4, 3, 2];  // bonus (in rank spots) for top need, 2nd need, ...
const RANDOMNESS = 7;                // random swing for the top players
const DEEP_RANDOMNESS = 0.4;         // deeper players swing more: rank x this
const LOOK_AHEAD = 15;               // computer only considers this many best-available players
const PICK_DELAY = 350;              // milliseconds between computer picks
const VALUE_MIN_MARGIN = 3;          // value labels: cushion for early picks
const VALUE_MARGIN_RATE = 0.12;      // value labels: cushion for later picks

// Data, filled in once the files load
let allPlayers = [];
let allTeams = [];
let draftOrder = [];

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

// ---------- Screen 1: pick your team ----------

function roundOnePicks(teamName) {
  const picks = draftOrder.filter((p) => p.round === 1 && p.team === teamName);
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
      <span class="team-name">${team.name}</span>
      <span class="team-picks">${roundOnePicks(team.name) || "No 1st-round pick"}</span>`;
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

function renderSetup() {
  renderTeams();
  renderRounds();
  const start = document.getElementById("start-button");
  if (myTeam) {
    start.disabled = false;
    start.textContent = `Start draft as the ${myTeam}`;
  } else {
    start.disabled = true;
    start.textContent = "Pick a team to start";
  }
}

function startDraft() {
  document.getElementById("setup-screen").hidden = true;
  document.getElementById("draft-screen").hidden = false;
  document.getElementById("draft-eyebrow").textContent =
    `${rounds} ${rounds === 1 ? "ROUND" : "ROUNDS"} · YOUR PICKS: ${roundOnePicks(myTeam) || "none in round 1"}`;
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

  renderFilters();
  renderBoard();
  renderFeed();
  window.scrollTo(0, 0);
  runDraft();
}

// ---------- The draft ----------

// Same idea as cpu_pick in draft_logic.py: lowest score wins
function cpuPick(teamName) {
  const candidates = available.slice(0, LOOK_AHEAD);
  const teamNeeds = needs[teamName];
  let best = null;
  let bestScore = Infinity;

  for (const p of candidates) {
    let bonus = 0;
    const idx = teamNeeds.indexOf(p.position);
    if (idx !== -1) {
      bonus = idx < NEED_BONUS.length ? NEED_BONUS[idx] : 1;
    }
    const swing = Math.max(RANDOMNESS, p.rank * DEEP_RANDOMNESS);
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
  const teamNeeds = needs[pick.team];
  const idx = teamNeeds.indexOf(player.position);
  if (idx !== -1) {
    teamNeeds.splice(idx, 1);   // need filled
  }
  results.push({ pick, player, label: valueLabel(pick.pick, player.rank) });
  nextPick++;
  renderFeed();
  renderBoard();
}

// Computer teams pick one at a time until it's your turn or the draft ends
function runDraft() {
  const pick = draftOrder[nextPick];
  const status = document.getElementById("status");

  if (!pick || pick.round > rounds) {
    showDraftComplete();
    return;
  }

  if (pick.team === myTeam) {
    onClock = true;
    showOnTheClock(pick);
    renderBoard();
    return;   // wait for you to tap a Draft button
  }

  status.textContent = `Pick ${pick.pick} · ${pick.team} picking…`;
  status.className = "status";
  makePick(pick, cpuPick(pick.team));
  setTimeout(runDraft, PICK_DELAY);
}

// ---------- Your pick ----------

function showOnTheClock(pick) {
  const status = document.getElementById("status");
  status.className = "status on-clock";
  const via = pick.from ? `from ${pick.from}` : "";
  const chips = needs[myTeam]
    .map((need, i) => `<span class="${i === 0 ? "chip top" : "chip"}">${need}</span>`)
    .join("");
  status.innerHTML = `
    <div class="clock-row">
      <span class="clock-label">ON THE CLOCK · PICK ${pick.pick}</span>
      <span class="clock-via">${via}</span>
    </div>
    <div class="clock-team">${myTeam}</div>
    <div class="chips">${chips || '<span class="chip">All needs filled</span>'}</div>`;

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
  makePick(draftOrder[nextPick], player);
  setTimeout(runDraft, PICK_DELAY);
}

function showDraftComplete() {
  const status = document.getElementById("status");
  status.className = "status";
  const mine = results.filter((r) => r.pick.team === myTeam);
  const list = mine
    .map((r) => `<li><b>#${r.pick.pick}</b> ${r.player.name} <span class="meta">${r.player.position}, ${r.player.college}</span></li>`)
    .join("");
  status.innerHTML = `
    <div class="clock-label">DRAFT COMPLETE</div>
    <div class="clock-team">Your draft class</div>
    <ol class="my-class">${list || "<li>You had no picks in these rounds.</li>"}</ol>`;
}

// Every pick so far, left to right, oldest first
function renderFeed() {
  const ticker = document.getElementById("feed");
  ticker.innerHTML = "";

  if (results.length === 0) {
    ticker.innerHTML = '<div class="tick empty">Picks show up here</div>';
    return;
  }

  for (const { pick, player, label } of results) {
    const card = document.createElement("div");
    card.className = pick.team === myTeam ? "tick mine" : "tick";
    card.innerHTML = `
      <span class="tick-top">${pick.pick} · ${pick.team}</span>
      <span class="tick-name">${player.name}</span>
      <span class="tick-bottom">${player.position} · <span class="label ${label.toLowerCase()}">${label}</span></span>`;
    ticker.appendChild(card);
  }

  // slide to the newest pick on the right
  ticker.scrollLeft = ticker.scrollWidth;
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
      <div class="info">
        <span class="name">${p.name}</span>
        <span class="meta">${p.position} · ${p.college}</span>
      </div>
      ${isNeed ? '<span class="need-tag">NEED</span>' : ""}`;

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

// ---------- Load everything ----------

async function loadJSON(path) {
  const response = await fetch(path);
  return response.json();
}

async function start() {
  allPlayers = await loadJSON("data/players.json");
  allTeams = await loadJSON("data/teams.json");
  draftOrder = await loadJSON("data/draft_order.json");

  document.getElementById("subtitle").textContent =
    `${allPlayers.length} prospects · ${draftOrder.length} picks`;
  document.getElementById("start-button").addEventListener("click", startDraft);
  renderSetup();
}

start();
