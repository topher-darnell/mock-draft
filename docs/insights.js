// Big Head GM: the "1,000 drafts" page.
// Reads data/sims.json (made by auto_mocks.py --save and export_json.py) and shows
// the consensus mock, position runs and each team's most likely picks.

const HAS_GM = typeof GM !== "undefined";
const POS_NAMES = {
  QB: "Quarterbacks", RB: "Running backs", WR: "Wide receivers", TE: "Tight ends",
  OT: "Offensive tackles", IOL: "Interior linemen", EDGE: "Edge rushers",
  IDL: "Interior D-linemen", LB: "Linebackers", CB: "Cornerbacks", S: "Safeties",
};

let sims = null;
let players = {};     // name -> player
let needs = {};       // team -> needs
let round = 1;
let position = "QB";

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function short(team) { return HAS_GM ? GM.short(team) : team.split(" ").pop(); }
function slug(team) { return team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function avatar(team, mood, size) {
  if (!HAS_GM) return "";
  return `<span class="avatar" style="background:${GM.tint(team)}">${GM.img(team, mood, size)}</span>`;
}
function pct(n) { return `${Math.round(n)}%`; }
function college(name) { return players[name] ? players[name].college : ""; }

// ---------- tabs and the address bar (#mock, #runs, #teams, #teams/chicago-bears) ----------

function route() {
  const [tab, team] = (location.hash.replace("#", "") || "mock").split("/");
  const name = ["mock", "runs", "teams"].includes(tab) ? tab : "mock";
  for (const t of document.querySelectorAll(".in-tab")) {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
  }
  for (const p of document.querySelectorAll(".in-panel")) p.hidden = p.id !== `panel-${name}`;
  if (name === "teams") showTeam(team ? sims.teams.find((t) => slug(t) === team) : null);
}

// ---------- consensus mock ----------

function renderRounds() {
  const box = document.getElementById("round-chips");
  box.innerHTML = "";
  for (let r = 1; r <= 7; r++) {
    const b = document.createElement("button");
    b.className = r === round ? "filter active" : "filter";
    b.textContent = `R${r}`;
    b.setAttribute("aria-label", `Round ${r}`);
    b.setAttribute("aria-pressed", r === round ? "true" : "false");
    b.addEventListener("click", () => { round = r; renderRounds(); renderMock(); });
    box.appendChild(b);
  }
}

function renderMock() {
  document.getElementById("mock-heading").textContent = `Round ${round}`;
  const list = document.getElementById("mock-list");
  list.innerHTML = sims.slots.filter((s) => s.round === round).map((s) => {
    const [name, pos, share] = s.top[0];
    const others = s.top.slice(1).map(([n, , p]) => `${esc(n)} ${pct(p)}`).join(" · ");
    return `
      <li class="in-pick">
        <span class="in-pick-no">${s.pick}</span>
        ${avatar(s.team, share >= 40 ? "happy" : "focused", 40)}
        <span class="in-pick-text">
          <span class="in-pick-team">${esc(short(s.team))}</span>
          <span class="in-pick-name">${esc(name)}</span>
          <span class="in-pick-meta">${pos} · ${esc(college(name))}</span>
          ${others ? `<span class="in-pick-alt">Also: ${others}</span>` : ""}
        </span>
        <span class="in-pick-pct" title="Taken here in ${pct(share)} of drafts">${pct(share)}</span>
      </li>`;
  }).join("");
}

// ---------- position runs ----------

function renderR1() {
  const rows = [...sims.positions].sort((a, b) => b.rounds[0] - a.rounds[0]);
  const top = rows[0].rounds[0];
  document.getElementById("r1-bars").innerHTML = rows.map((p) => `
    <li class="in-hbar">
      <span class="in-hbar-label">${p.pos}</span>
      <span class="in-hbar-track"><span style="width:${Math.max(2, 100 * p.rounds[0] / top)}%"></span></span>
      <span class="in-hbar-value">${p.rounds[0].toFixed(1)}</span>
    </li>`).join("");
}

function renderPositions() {
  const box = document.getElementById("pos-chips");
  box.innerHTML = "";
  for (const p of sims.positions.map((x) => x.pos).sort((a, b) => Object.keys(POS_NAMES).indexOf(a) - Object.keys(POS_NAMES).indexOf(b))) {
    const b = document.createElement("button");
    b.className = p === position ? "filter active" : "filter";
    b.textContent = p;
    b.setAttribute("aria-pressed", p === position ? "true" : "false");
    b.addEventListener("click", () => { position = p; renderPositions(); renderRuns(); });
    box.appendChild(b);
  }
}

function ordinal(n) { return ["first", "second", "third"][n]; }

function renderRuns() {
  const p = sims.positions.find((x) => x.pos === position);
  const label = POS_NAMES[position] || position;
  document.getElementById("runs-heading").textContent = `${label} by round`;
  const offs = p.off.map((v, i) => (v ? `the ${ordinal(i)} at pick ${Math.round(v)}` : "")).filter(Boolean);
  document.getElementById("runs-callout").innerHTML =
    `About <b>${p.rounds[0].toFixed(1)}</b> go in round 1. On average ${offs.join(", ")}.`;
  const max = Math.max(...sims.positions.flatMap((x) => x.rounds), 1);
  const chart = document.getElementById("runs-chart");
  chart.setAttribute("aria-label", `${label} taken per round: ` + p.rounds.map((v, i) => `round ${i + 1}, ${v.toFixed(1)}`).join("; "));
  chart.innerHTML = p.rounds.map((v, i) => `
    <div class="in-vbar">
      <span class="in-vbar-value">${v.toFixed(1)}</span>
      <span class="in-vbar-track"><span style="height:${Math.max(1, 100 * v / max)}%"></span></span>
      <span class="in-vbar-label">R${i + 1}</span>
    </div>`).join("");
}

// ---------- teams ----------

function renderTeamGrid() {
  const grid = document.getElementById("team-grid");
  grid.innerHTML = "";
  for (const team of sims.teams) {
    const picks = sims.slots.filter((s) => s.team === team);
    const a = document.createElement("a");
    a.className = "home-team";
    a.href = `#teams/${slug(team)}`;
    a.setAttribute("aria-label", `${team}: most likely picks`);
    a.innerHTML = `${avatar(team, "neutral", 60)}
      <span class="home-team-name${short(team).length > 9 ? " long" : ""}">${esc(short(team))}</span>
      <span class="home-team-picks">${picks.length} pick${picks.length === 1 ? "" : "s"}</span>`;
    grid.appendChild(a);
  }
}

function showTeam(team) {
  const wrap = document.getElementById("team-grid-wrap");
  const detail = document.getElementById("team-detail");
  if (!team) { wrap.hidden = false; detail.hidden = true; return; }
  const picks = sims.slots.filter((s) => s.team === team);
  const first = picks[0] && picks[0].top[0];
  detail.innerHTML = `
    <a class="in-back" href="#teams">← All teams</a>
    <div class="in-team-head">
      ${avatar(team, "neutral", 92)}
      <div>
        <h2 class="in-team-name">${esc(team)}</h2>
        <p class="in-team-needs">Top needs: ${(needs[team] || []).slice(0, 5).join(" · ") || "—"}</p>
        ${first ? `<p class="in-team-sum">Most likely first pick: <b>${esc(first[0])}</b> (${first[1]}) at #${picks[0].pick}, in ${pct(first[2])} of drafts.</p>` : ""}
      </div>
    </div>
    <h3 class="pc-label">MOST LIKELY PICK AT EACH SLOT</h3>
    <ol class="in-mock">${picks.map((s) => {
      const [name, pos, share] = s.top[0];
      const others = s.top.slice(1).map(([n, , p]) => `${esc(n)} ${pct(p)}`).join(" · ");
      return `
        <li class="in-pick">
          <span class="in-pick-no">${s.pick}</span>
          <span class="in-pick-text">
            <span class="in-pick-team">Round ${s.round}</span>
            <span class="in-pick-name">${esc(name)}</span>
            <span class="in-pick-meta">${pos} · ${esc(college(name))}</span>
            ${others ? `<span class="in-pick-alt">Also: ${others}</span>` : ""}
          </span>
          <span class="in-pick-pct">${pct(share)}</span>
        </li>`;
    }).join("")}</ol>`;
  wrap.hidden = true;
  detail.hidden = false;
  detail.querySelector(".in-back").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// ---------- start ----------

async function start() {
  try {
    const [s, p, t] = await Promise.all(["data/sims.json", "data/players.json", "data/teams.json"]
      .map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); })));
    sims = s;
    for (const x of p) players[x.name] = x;
    for (const x of t) needs[x.name] = x.needs;
    sims.teams = HAS_GM ? GM.TEAM_NAMES.filter((n) => needs[n]) : t.map((x) => x.name);
  } catch (e) {
    document.getElementById("in-error").hidden = false;
    return;
  }
  document.getElementById("in-sub").textContent =
    `We ran ${sims.sims.toLocaleString("en-US")} computer-only drafts with today's big board, draft order and team needs. Here's what happens most.`;
  for (const t of document.querySelectorAll(".in-tab")) {
    t.addEventListener("click", () => { location.hash = t.dataset.tab; });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = [...document.querySelectorAll(".in-tab")];
      const next = tabs[(tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      location.hash = next.dataset.tab; next.focus();
    });
  }
  renderRounds(); renderMock(); renderR1(); renderPositions(); renderRuns(); renderTeamGrid();
  window.addEventListener("hashchange", route);
  route();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

start();
