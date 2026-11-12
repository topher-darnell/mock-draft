// Big Head GM: "Your lineup this week". The team and league settings are saved on this device only
// (localStorage), no account. We fill the league's starting spots with the best projections this week.
(function () {
  const $ = (id) => document.getElementById(id);
  const D = JSON.parse($("gd-data").textContent);
  const KEY = "bhg-myteam", SET_KEY = "bhg-myteam-league";
  const MAX = 25;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // [name, team, pos, slug, [std, half, ppr] projection, opp, matchup, call, posRank, why, news]
  const BY = {};
  D.players.forEach((p) => { BY[p[3]] = p; });
  const MATCH = { g2: "very easy", g1: "easy", n: "average", r1: "tough", r2: "very tough" };
  const TAG = { injury: "Injury", trade: "Trade", qb: "New QB", return: "Return" };
  const FMT = [["ppr", "PPR", 2], ["half", "Half PPR", 1], ["std", "Standard", 0]];
  // starting spots: label, who can fill it, how many allowed
  const SLOTS = [
    ["QB", "QB", ["QB"], 1, 2], ["RB", "RB", ["RB"], 0, 4], ["WR", "WR", ["WR"], 0, 5], ["TE", "TE", ["TE"], 0, 3],
    ["FLEX", "Flex", ["RB", "WR", "TE"], 0, 4], ["SF", "Superflex", ["QB", "RB", "WR", "TE"], 0, 2],
  ];
  const DEF = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0, fmt: "ppr" };

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } };
  let team = load(KEY, []).filter((s) => BY[s]);
  let L = Object.assign({}, DEF, load(SET_KEY, {}));
  let editing = false;
  const fi = () => (FMT.find((f) => f[0] === L.fmt) || FMT[0])[2];
  const pts = (p) => p[4][fi()];
  const plays = (p) => p[7] !== "OUT" && p[7] !== "BYE" && pts(p) > 0;

  // fill fixed spots first, then flex, then superflex, each with the best projection left
  function lineup(ps) {
    const left = ps.filter(plays).sort((a, b) => pts(b) - pts(a));
    const starters = [];
    for (const [key, , can] of SLOTS) {
      for (let i = 0; i < L[key]; i++) {
        const k = left.findIndex((p) => can.includes(p[2]));
        starters.push({ slot: key, can, p: k >= 0 ? left.splice(k, 1)[0] : null });
      }
    }
    const bench = ps.filter((p) => !starters.some((s) => s.p === p)).sort((a, b) => plays(b) - plays(a) || pts(b) - pts(a));
    return { starters, bench };
  }

  function row(p, slot, note) {
    const [n, t, pos, slug, , opp, m, call, , why] = p;
    const out = call === "OUT" || call === "BYE";
    if (editing) {
      return `<li class="gd-p gd-edit-row"><span class="gd-pos ${pos}">${pos}</span><span class="gd-pmain"><b class="gd-name">${esc(n)}</b>` +
        `<span class="gd-meta">${esc(t)}</span></span><button class="gd-x" data-del="${slug}" aria-label="Remove ${esc(n)}">✕</button></li>`;
    }
    const sub = call === "OUT" ? "Not expected to play" : !opp ? "Bye this week"
      : `vs ${esc(opp)} · ${MATCH[m] || "average"} · <b>${pts(p).toFixed(1)}</b> pts`;
    const pill = slot ? `<span class="gd-call START">START</span>` : `<span class="gd-call ${out ? call : "BENCH"}">${out ? call : "BENCH"}</span>`;
    const chip = slot && (slot === "FLEX" || slot === "SF") ? `<span class="gd-pos ${pos} gd-flex">${slot}</span>` : `<span class="gd-pos ${pos}">${pos}</span>`;
    return `<li class="gd-p${slot ? "" : " gd-bench"}">${chip}` +
      `<span class="gd-pmain"><a class="gd-name" href="fantasy/${slug}.html">${esc(n)}</a><span class="gd-meta">${esc(t)}${slot === "FLEX" || slot === "SF" ? " " + pos : ""} ${sub}</span>` +
      `<span class="gd-why">${esc(note || why)}</span></span>${pill}</li>`;
  }

  function lastName(p) { return p[0].split(" ").slice(-1)[0]; }

  function renderList() {
    const ps = team.map((s) => BY[s]);
    if (editing) {
      $("gd-list").innerHTML = ps.slice().sort((a, b) => pts(b) - pts(a)).map((p) => row(p, null)).join("");
      return;
    }
    const { starters, bench } = lineup(ps);
    const html = starters.map((s) => {
      if (!s.p) return `<li class="gd-p gd-open"><span class="gd-pos">${s.slot}</span><span class="gd-pmain"><b>Empty ${s.slot === "SF" ? "Superflex" : s.slot === "FLEX" ? "Flex" : s.slot} spot</b>` +
        `<span class="gd-meta">Add ${["QB", "TE", "WR"].includes(s.can[0]) ? "a" : "an"} ${s.can.length > 1 ? s.can.slice(0, -1).join(", ") + " or " + s.can[s.can.length - 1] : s.can[0]} to fill it</span></span></li>`;
      return row(s.p, s.slot);
    });
    const close = (b) => {                       // a bench player within a point of someone he could replace
      if (!plays(b)) return "";
      const rival = starters.filter((s) => s.p && s.can.includes(b[2])).sort((x, y) => pts(x.p) - pts(y.p))[0];
      return rival && pts(rival.p) - pts(b) <= 1 ? `Close call with ${lastName(rival.p)} (${pts(rival.p).toFixed(1)} pts)` : "";
    };
    if (bench.length) html.push(`<li class="gd-sep">Bench</li>`, ...bench.map((b) => row(b, null, close(b))));
    $("gd-list").innerHTML = html.join("");
  }

  function renderSettings() {
    $("gd-slots").innerHTML = SLOTS.map(([key, label, , lo, hi]) =>
      `<div class="gd-step"><span>${label}</span><span class="gd-stepper">` +
      `<button type="button" data-step="${key}" data-d="-1" aria-label="Fewer ${label} spots"${L[key] <= lo ? " disabled" : ""}>−</button>` +
      `<b aria-live="polite">${L[key]}</b>` +
      `<button type="button" data-step="${key}" data-d="1" aria-label="More ${label} spots"${L[key] >= hi ? " disabled" : ""}>+</button></span></div>`).join("");
    $("gd-fmt").innerHTML = FMT.map(([k, label]) =>
      `<button type="button" class="filter${L.fmt === k ? " active" : ""}" data-fmt="${k}" aria-pressed="${L.fmt === k}">${label}</button>`).join("");
  }

  function render() {
    const has = team.length > 0;
    $("gd-empty").hidden = has || editing;
    $("gd-edit").hidden = !has || editing;
    $("gd-editor").hidden = !editing;
    $("gd-done").hidden = !editing;
    if (editing) renderSettings();
    renderList();
    const news = team.map((s) => BY[s]).filter((p) => p[10]).map((p) => {
      const [kind, text, date] = p[10];
      const d = new Date(date + "T12:00:00");
      return `<li class="nw-item"><span class="nw-tag ${esc(kind)}">${TAG[kind] || "News"}</span><span class="nw-text">${esc(text)} ` +
        `<span class="nw-meta"><time datetime="${date}">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></span></span></li>`;
    });
    $("gd-news").hidden = editing || !news.length;
    $("gd-news-list").innerHTML = news.join("");
    const spots = SLOTS.filter(([k]) => L[k]).map(([k]) => `${L[k]} ${k === "SF" ? "Superflex" : k === "FLEX" ? "Flex" : k}`).join(", ");
    const fmt = (FMT.find((f) => f[0] === L.fmt) || FMT[0])[1];
    $("gd-fine").textContent = editing ? `${team.length} of ${MAX} players · saved on this device`
      : `${fmt} · starts ${spots}. Saved on this device. No account needed.`;
  }

  function suggest() {
    const q = $("gd-q").value.trim().toLowerCase();
    const box = $("gd-sug");
    if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    const hits = D.players.filter((p) => !team.includes(p[3]) && p[0].toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((p) =>
      `<li><button type="button" data-add="${p[3]}"><span class="gd-pos ${p[2]}">${p[2]}</span><span>${esc(p[0])} <span class="gd-meta">${esc(p[1])}</span></span></button></li>`).join("")
      : `<li class="gd-none">No player found</li>`;
    box.hidden = false;
  }

  function open(on) {
    editing = on;
    render();
    if (on) { $("gd-q").value = ""; suggest(); }
  }

  $("gd-add").addEventListener("click", () => { open(true); $("gd-q").focus(); });
  $("gd-edit").addEventListener("click", () => open(true));
  $("gd-done").addEventListener("click", () => { open(false); $("gd-team-h").scrollIntoView({ block: "nearest" }); });
  $("gd-q").addEventListener("input", suggest);
  $("gd-sug").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b || team.length >= MAX) return;
    team.push(b.dataset.add); store(KEY, team);
    $("gd-q").value = ""; suggest(); render(); $("gd-q").focus();
  });
  $("gd-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    team = team.filter((s) => s !== b.dataset.del); store(KEY, team); render();
  });
  $("gd-slots").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const s = SLOTS.find((x) => x[0] === b.dataset.step);
    L[s[0]] = Math.max(s[3], Math.min(s[4], L[s[0]] + Number(b.dataset.d)));
    store(SET_KEY, L); render();
  });
  $("gd-fmt").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fmt]");
    if (!b) return;
    L.fmt = b.dataset.fmt; store(SET_KEY, L); render();
  });
  render();
})();
