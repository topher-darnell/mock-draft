// "Who ya got?": fans vote A or B on this week's start/sit matchups and see live results.
// Votes are counters in Firestore (votes/<id> = {a, b}); the security rules only allow adding 1.
(function () {
  "use strict";
  const box = document.getElementById("vote");
  const dataEl = document.getElementById("vote-data");
  if (!box || !dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const CFG = D.firebase || {};
  if (!CFG.projectId || !CFG.apiKey) return;          // not set up yet: the card stays hidden
  const BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;
  const KEY = "bhg-votes";
  const mine = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const remember = (id, side) => { const m = mine(); m[id] = side; try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* private mode */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const counts = {};

  let broken = false;                                  // Firebase said no (bad key or rules): hide the card
  async function load(id) {
    try {
      const r = await fetch(`${BASE}/votes/${id}?key=${CFG.apiKey}`);
      if (r.status === 400 || r.status === 401 || r.status === 403) { broken = true; box.hidden = true; }
      if (!r.ok) return { a: 0, b: 0 };
      const f = (await r.json()).fields || {};
      return { a: +(f.a && f.a.integerValue || 0), b: +(f.b && f.b.integerValue || 0) };
    } catch (e) { return { a: 0, b: 0 }; }
  }
  async function cast(id, side) {
    const name = `projects/${CFG.projectId}/databases/(default)/documents/votes/${id}`;
    const body = { writes: [{ transform: { document: name, fieldTransforms: [{ fieldPath: side, increment: { integerValue: "1" } }] } }] };
    try {
      const r = await fetch(`${BASE}:commit?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return r.ok;
    } catch (e) { return false; }
  }

  function row(m) {
    const voted = mine()[m.id], c = counts[m.id] || { a: 0, b: 0 }, total = c.a + c.b;
    const pct = (k) => total ? Math.round(100 * c[k] / total) : 0;
    const side = (k) => {
      const name = m[k], isPick = m.pick === k, yours = voted === k;
      if (!voted) return `<button class="vt-btn" data-id="${m.id}" data-side="${k}"><b>${k.toUpperCase()}</b><span>${esc(name)}</span></button>`;
      return `<div class="vt-res${yours ? " yours" : ""}"><i style="width:${pct(k)}%"></i><b>${pct(k)}%</b><span>${esc(name)}</span>` +
             `${yours ? '<em class="vt-tag">YOU</em>' : ""}${isPick ? '<em class="vt-tag pick">OUR PICK</em>' : ""}</div>`;
    };
    return `<li class="vt-row"><span class="pos ${m.pos}">${m.pos}</span><div class="vt-sides">${side("a")}${side("b")}</div>` +
           (voted ? `<p class="vt-why">${esc(m.why)} <span>${total.toLocaleString()} vote${total === 1 ? "" : "s"}</span></p>` : "") + `</li>`;
  }
  function render() {
    box.querySelector(".vt-list").innerHTML = D.matchups.map(row).join("");
    const done = D.matchups.filter((m) => mine()[m.id]).length;
    box.querySelector(".vt-count").textContent = done === D.matchups.length ? "All in. Check back after the games 👀" : `${done}/${D.matchups.length} picked`;
  }
  box.addEventListener("click", async (e) => {
    const b = e.target.closest(".vt-btn");
    if (!b) return;
    const { id, side } = b.dataset;
    remember(id, side);
    counts[id] = counts[id] || { a: 0, b: 0 };
    counts[id][side]++;                                  // show it right away
    render();
    try { window.BHG && BHG.countEvent("vote", "Voted on a matchup"); } catch (err) { /* ignore */ }
    try { const P = window.Capacitor && Capacitor.Plugins; P && P.Haptics && P.Haptics.impact({ style: "LIGHT" }); } catch (err) { /* ignore */ }
    if (!(await cast(id, side))) return;
    counts[id] = await load(id);
    render();
  });
  // check Firebase first, then show the card
  Promise.all(D.matchups.map(async (m) => { counts[m.id] = await load(m.id); })).then(() => {
    if (broken) return;
    box.hidden = false;
    render();
  });
})();
