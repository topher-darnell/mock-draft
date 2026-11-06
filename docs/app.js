// Mock Draft website

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"];

// Settings: the same ones you tuned in config.py
const NEED_BONUS = [8, 6, 4, 3, 2];  // bonus (in rank spots) for top need, 2nd need, ...
const RANDOMNESS = 7;                // random swing for the top players
const DEEP_RANDOMNESS = 0.4;         // deeper players swing more: rank x this
const LOOK_AHEAD = 15;               // computer only considers this many best-available players
const PICK_DELAY = 350;              // milliseconds between computer picks

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

function makePick(pick, player) {
  available = available.filter((p) => p !== player);
  const teamNeeds = needs[pick.team];
  const idx = teamNeeds.indexOf(player.position);
  if (idx !== -1) {
    teamNeeds.splice(idx, 1);   // need filled
  }
  results.push({ pick, player });
  nextPick++;
  renderFeed();
  renderBoard();
}

// Computer teams pick one at a time until it's your turn or the draft ends
function runDraft() {
  const pick = draftOrder[nextPick];
  const status = document.getElementById("status");

  if (!pick || pick.round > rounds) {
    status.textContent = "Draft complete";
    status.className = "status";
    return;
  }

  if (pick.team === myTeam) {
    status.textContent = `You're on the clock · Pick ${pick.pick}`;
    status.className = "status on-clock";
    return;   // Nov 14: let you make the pick
  }

  status.textContent = `Pick ${pick.pick} · ${pick.team} picking…`;
  status.className = "status";
  makePick(pick, cpuPick(pick.team));
  setTimeout(runDraft, PICK_DELAY);
}

function renderFeed() {
  const feed = document.getElementById("feed");
  feed.innerHTML = "";
  for (const { pick, player } of results.slice(-5)) {
    const li = document.createElement("li");
    li.className = pick.team === myTeam ? "feed-item mine" : "feed-item";
    const via = pick.from ? ` (from ${pick.from})` : "";
    li.innerHTML = `
      <span class="feed-pick">${pick.pick}</span>
      <div class="info">
        <span class="name">${player.name}</span>
        <span class="meta">${pick.team}${via} · ${player.position}, ${player.college}</span>
      </div>`;
    feed.appendChild(li);
  }
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
    li.innerHTML = `
      <span class="rank">${p.rank}</span>
      <div class="info">
        <span class="name">${p.name}</span>
        <span class="meta">${p.position} · ${p.college}</span>
      </div>`;
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
