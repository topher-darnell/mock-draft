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
const LABEL_POINTS = { STEAL: 3, Value: 2, Fair: 1, Reach: 0 };  // grade points per pick
const TRADE_WINDOW = 15;             // teams within this many picks of you make offers

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
  draftOrder = baseOrder.map((p) => ({ ...p }));   // fresh copy, so trades don't carry over

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
    document.getElementById("action-bar").hidden = false;
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
  document.getElementById("action-bar").hidden = true;
  makePick(draftOrder[nextPick], player);
  setTimeout(runDraft, PICK_DELAY);
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
  if (!onClock) return;
  const myPick = draftOrder[nextPick];
  const offers = findTradeOffers(myPick);
  const myValue = value(myPick);

  document.getElementById("trade-title").textContent = `Trade down from #${myPick.pick}`;
  document.getElementById("trade-worth").innerHTML =
    `<span>Your pick is worth</span><b>${Math.round(myValue).toLocaleString()} pts</b>`;

  const box = document.getElementById("trade-offers");
  box.innerHTML = "";
  if (offers.length === 0) {
    box.innerHTML = '<p class="meta">No teams want to trade up right now.</p>';
  }
  for (const offer of offers) {
    const diff = Math.round(offer.total - myValue);
    const card = document.createElement("div");
    card.className = "offer";
    card.innerHTML = `
      <div class="offer-top">
        <span class="offer-team">${offer.team}</span>
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

  document.getElementById("trade-sheet").hidden = false;
}

function closeTradeSheet() {
  document.getElementById("trade-sheet").hidden = true;
}

function acceptTrade(myPick, offer) {
  makeTrade(myPick, offer);
  closeTradeSheet();
  onClock = false;
  document.getElementById("hints").hidden = true;
  document.getElementById("action-bar").hidden = true;

  const status = document.getElementById("status");
  status.className = "status traded";
  status.textContent = `Trade! #${myPick.pick} to ${offer.team} for ${offer.picks.map((p) => "#" + p.pick).join(", ")}`;
  renderBoard();
  setTimeout(runDraft, 1500);   // pause so you can read the trade
}

function showDraftComplete() {
  const status = document.getElementById("status");
  status.className = "status";
  status.textContent = "Draft complete";
  setTimeout(showResults, 600);
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

  if (me) {
    const needsFilled = mine.filter((r) => r.filledNeed).length;
    document.getElementById("my-grade").textContent = me.grade;
    document.getElementById("my-grade").className = `grade-letter grade-${me.grade.toLowerCase()}`;
    document.getElementById("my-grade-detail").innerHTML =
      `${me.avg.toFixed(2)} points per pick<br>${me.place} of ${teams.length} · ${needsFilled} ${needsFilled === 1 ? "need" : "needs"} filled`;
  } else {
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
      <span class="grade-small grade-${t.grade.toLowerCase()}">${t.grade}</span>
      <span class="grade-row-name">${t.name}</span>
      <span class="grade-row-avg">${t.avg.toFixed(2)}</span>`;
    all.appendChild(li);
  }

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

function renderFeed() {
  const ticker = document.getElementById("feed");
  ticker.innerHTML = "";

  if (results.length === 0) {
    ticker.innerHTML = '<div class="tick empty">Picks show up here</div>';
    return;
  }

  for (const { pick, team, player, label } of results) {
    const card = document.createElement("div");
    card.className = team === myTeam ? "tick mine" : "tick";
    card.innerHTML = `
      <span class="tick-top">${pick.pick} · ${team}</span>
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
  baseOrder = await loadJSON("data/draft_order.json");
  draftOrder = baseOrder;
  tradeChart = await loadJSON("data/trade_chart.json");

  document.getElementById("subtitle").textContent =
    `${allPlayers.length} prospects · ${draftOrder.length} picks`;
  document.getElementById("start-button").addEventListener("click", startDraft);
  document.getElementById("view-picks-button").addEventListener("click", viewPicks);
  document.getElementById("new-mock-button").addEventListener("click", newMock);
  document.getElementById("trade-button").addEventListener("click", openTradeSheet);
  document.getElementById("close-trade").addEventListener("click", closeTradeSheet);
  renderSetup();
}

start();
