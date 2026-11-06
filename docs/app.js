// Mock Draft website

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"];

// Data, filled in once the files load
let allPlayers = [];
let allTeams = [];
let draftOrder = [];

// What the user has chosen
let myTeam = null;
let rounds = 1;
let currentFilter = "All";

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
  renderFilters();
  renderBoard();
  window.scrollTo(0, 0);
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
  let shown = allPlayers;
  if (currentFilter !== "All") {
    shown = allPlayers.filter((p) => p.position === currentFilter);
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
