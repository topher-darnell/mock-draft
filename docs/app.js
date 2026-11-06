// Load the big board from players.json and show every prospect

async function loadBoard() {
  const response = await fetch("data/players.json");
  const players = await response.json();

  document.getElementById("subtitle").textContent = players.length + " prospects · 257 picks";

  const board = document.getElementById("board");
  for (const p of players) {
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

loadBoard();