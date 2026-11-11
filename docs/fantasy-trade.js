// Big Head GM fantasy trade analyzer: who wins the trade?
// Player numbers come from the page (built by build_pages.py from fantasy.py), same as the fantasy mock draft.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const raw = JSON.parse($("ft-data").textContent);
  const FMT = { std: 0, half: 1, ppr: 2, tep: 3 };
  const POS = ["QB", "RB", "WR", "TE"];
  const count = (path, title) => { try { window.BHG && BHG.countEvent(path, title); } catch (e) { /* ignore */ } };

  const QB = raw.qb || {};        // slug -> [multiplier from a new starting QB, QB name, named/expected] (redraft only)
  const INJ = raw.inj || {};      // slug -> [share of remaining games available, status, back week]
  const ALL = [
    ...raw.v.map(([name, team, pos, games, ppg, age, slug, real, long]) =>
      ({ id: slug, name, team, pos, games, ppg, real, long: long || ppg, age, slug, rookie: false })),
    ...raw.r.map(([name, pos, college, ppg, dyn, age, team, slug]) =>
      ({ id: slug, name, team: team || college, college, pos, ppg, dyn, age, slug, rookie: true })),
  ];

  // ---------- settings ----------
  const S = { fmt: "ppr", teams: 12, qb: "1qb", kind: "redraft" };
  try { Object.assign(S, JSON.parse(localStorage.getItem("bhg-ft-settings") || "{}")); } catch (e) { /* first visit */ }
  const params = new URLSearchParams(location.search);
  for (const k of ["fmt", "qb", "kind"]) if (params.get(k)) S[k] = params.get(k);
  if (params.get("teams")) S.teams = Number(params.get("teams")) || 12;
  const save = () => { try { localStorage.setItem("bhg-ft-settings", JSON.stringify(S)); } catch (e) { /* private mode */ } };

  // ---------- values ----------
  function dynastyMult(pos, age) {
    const cliff = { QB: 37, RB: 29, WR: 31, TE: 32 }[pos];
    const top = pos === "QB" && S.qb === "1qb" ? 1.0 : 1.35;
    return Math.max(0.3, Math.min(top, 0.45 + 0.08 * (cliff - (age || 27))));
  }
  // Redraft: rest-of-season points per game (2026 average, steadied for players with few games).
  // Dynasty: the same, weighted for age, plus the 2027 rookies.
  const base = (p) => {
    const i = FMT[S.fmt];
    if (S.kind === "redraft") return p.ppg[i] * (QB[p.slug] ? QB[p.slug][0] : 1);   // new starting QB moves receivers a bit
    // a quarter of a veteran's value is what he does now (contenders still want him), the rest is his future
    // dynasty: 2026 blended with his 2024-25 seasons, so one down (or hot) year doesn't decide it
    return p.rookie ? p.dyn[i] : p.long[i] * (0.25 + 0.75 * dynastyMult(p.pos, p.age));
  };

  let pool = [], picks = [];
  function rank() {
    pool = ALL.filter((p) => S.kind === "dynasty" || !p.rookie).map((p) => ({ ...p }));
    const T = S.teams, sf = S.qb === "sf" ? 1 : 0, qb = S.qb === "2qb" ? 2 : 1;
    // starting spots per position across the league (1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX lineups)
    const demand = { QB: T * (qb + sf * 0.85), RB: T * (2 + 0.45 + sf * 0.07), WR: T * (2 + 0.45 + sf * 0.07), TE: T * 1.1 };
    for (const p of pool) p.b = base(p);
    for (const pos of POS) {
      const group = pool.filter((p) => p.pos === pos).sort((a, b) => b.b - a.b);
      const repl = group[Math.min(group.length - 1, Math.floor(demand[pos]))].b;
      const discount = pos === "QB" && S.qb === "1qb" ? 0.55 : 1;
      // redraft: an injured player's edge over a waiver pickup only counts for the games he'll play
      const avail = (p) => (S.kind === "redraft" && INJ[p.slug] ? INJ[p.slug][0] : 1);
      group.forEach((p, k) => { p.vor = (p.b - repl) * (p.b > repl ? discount * avail(p) : 1); p.posRank = k + 1; });
    }
    // stars are worth more than two good players: value grows faster than points
    for (const p of pool) p.raw = Math.pow(Math.max(0, p.vor + 1.5), 1.6);
    const top = Math.max(...pool.map((p) => p.raw));
    for (const p of pool) p.val = Math.max(0.1, Math.round(1000 * p.raw / top) / 10);   // 0 to 100
    pool.sort((a, b) => b.val - a.val);
    pool.forEach((p, k) => { p.rank = k + 1; });

    // 2027 rookie draft picks (dynasty only): worth the rookies usually taken in that range
    picks = [];
    if (S.kind === "dynasty") {
      const rooks = pool.filter((p) => p.rookie).sort((a, b) => b.val - a.val);
      const third = Math.ceil(S.teams / 3);
      [["1st", 0], ["2nd", 1], ["3rd", 2]].forEach(([rd, r]) => {
        [["Early", 0], ["Mid", 1], ["Late", 2]].forEach(([when, w]) => {
          const from = r * S.teams + w * third, slice = rooks.slice(from, from + third);
          if (!slice.length) return;
          const val = Math.round(10 * slice.reduce((t, p) => t + p.val, 0) / slice.length) / 10 * 0.92;   // a pick is a guess, so a little less
          picks.push({ id: `pick-${rd}-${when}`.toLowerCase(), name: `2027 ${when} ${rd}`, pos: "PICK", pick: true, val: Math.round(val * 10) / 10,
            note: `Rookie pick ${r + 1}.${String(w * third + 1).padStart(2, "0")}–${r + 1}.${String(Math.min(S.teams, (w + 1) * third)).padStart(2, "0")}` });
        });
      });
    }
  }
  const fmtVal = (v) => (v < 1 ? "<1" : v.toFixed(1));
  const find = (id) => pool.find((p) => p.id === id) || picks.find((p) => p.id === id);

  // ---------- the trade ----------
  let give = [], get = [];   // ids
  // A side with fewer, better players wins ties: each extra player counts a little less.
  function sideTotal(ids) {
    return ids.map(find).filter(Boolean).map((p) => p.val).sort((a, b) => b - a)
      .reduce((t, v, k) => t + v * Math.max(0.55, 1 - 0.15 * k), 0);
  }

  function sub(p) {
    if (p.pick) return p.note;
    const i = FMT[S.fmt];
    const now = p.rookie ? "Rookie" : `'26 ${p.real[i].toFixed(1)} PPG`;
    const hurt = INJ[p.slug];
    const tag = !hurt ? "" : hurt[1] === "season" ? " · Out for season" : hurt[1] === "ir" ? ` · On IR${hurt[2] && hurt[2] < 99 ? ", back ~Wk " + hurt[2] : ""}` : hurt[1] === "out" ? " · Out" : ` · ${hurt[1][0].toUpperCase() + hurt[1].slice(1)}`;
    const nq = QB[p.slug];
    const qb = S.kind === "redraft" && nq ? ` · New QB ${nq[1]}${nq[2] === "expected" ? " (expected)" : ""} ${nq[0] > 1 ? "↑" : "↓"}` : "";
    return `${p.pos}${p.posRank} · ${p.rookie ? p.team || p.college : p.team}${p.age ? " · " + Math.floor(p.age) : ""} · ${now}${tag}${qb}`;
  }

  function renderSide(which) {
    const ids = which === "give" ? give : get;
    $(`ft-${which}-list`).innerHTML = ids.map(find).filter(Boolean).map((p) => `
      <li class="ft-item">
        <span class="fd-pos ${p.pos.toLowerCase()}">${p.pos}</span>
        <span class="fd-who"><b>${p.name}</b><span>${sub(p)}</span></span>
        <span class="ft-val">${fmtVal(p.val)}</span>
        <button class="ft-x" data-side="${which}" data-id="${p.id}" aria-label="Remove ${p.name}">✕</button>
      </li>`).join("") || `<li class="ft-empty">Add a player${S.kind === "dynasty" ? " or pick" : ""} below.</li>`;
    $(`ft-${which}-total`).textContent = ids.length ? sideTotal(ids).toFixed(1) : "0";
  }

  function render() {
    renderSide("give");
    renderSide("get");
    renderVerdict();
    renderSettings();
    const q = new URLSearchParams({ give: give.join(","), get: get.join(","), fmt: S.fmt, teams: S.teams, qb: S.qb, kind: S.kind });
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }

  function renderVerdict() {
    const box = $("ft-verdict");
    if (!give.length || !get.length) {
      box.className = "ft-verdict";
      box.innerHTML = `<p class="ft-v-title">Add players to both sides</p><p class="ft-v-sub">Put what you'd send under You give and what you'd get back under You get.</p>`;
      $("ft-balance").hidden = true;
      return;
    }
    const g = sideTotal(give), t = sideTotal(get);
    const diff = t - g, pct = diff / Math.max(g, t, 1);
    let title, sub2, cls;
    if (Math.abs(pct) < 0.07) { title = "Fair trade"; cls = "fair"; sub2 = "Close enough that it comes down to what your team needs."; }
    else if (pct > 0) { title = pct < 0.18 ? "Slight edge to you" : "You win this trade"; cls = "win"; sub2 = `You get ${diff.toFixed(1)} more in trade value.`; }
    else { title = pct > -0.18 ? "Slight edge to them" : "You lose this trade"; cls = "lose"; sub2 = `You give up ${(-diff).toFixed(1)} more in trade value than you get back.`; }
    const left = Math.max(4, Math.min(96, 50 + pct * 120));
    box.className = `ft-verdict ${cls}`;
    box.innerHTML = `
      <p class="ft-v-title">${title}</p>
      <p class="ft-v-sub">${sub2}</p>
      <div class="ft-meter" role="img" aria-label="${title}"><span class="ft-meter-mid"></span><span class="ft-meter-dot" style="left:${left}%"></span></div>
      <div class="ft-meter-labels"><span>They win</span><span>Fair</span><span>You win</span></div>
      ${positions()}`;
    renderBalance(diff);
  }

  // Positions that change hands, in plain words
  function positions() {
    const tally = (ids) => { const c = {}; ids.map(find).filter(Boolean).forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; }); return c; };
    const a = tally(give), b = tally(get);
    const out = [];
    for (const pos of [...POS, "PICK"]) {
      const d = (b[pos] || 0) - (a[pos] || 0);
      if (d) out.push(`${d > 0 ? "+" : "−"}${Math.abs(d)} ${pos === "PICK" ? (Math.abs(d) > 1 ? "picks" : "pick") : pos}`);
    }
    const n = get.length - give.length;
    const spots = n > 0 ? `You'll need ${n} open roster spot${n > 1 ? "s" : ""}.` : n < 0 ? `You'll open up ${-n} roster spot${n < -1 ? "s" : ""}.` : "";
    return out.length ? `<p class="ft-v-pos">Your roster: ${out.join(", ")}. ${spots}</p>` : "";
  }

  // Ideas to even it out: players worth about the gap
  function renderBalance(diff) {
    const box = $("ft-balance");
    const gap = Math.abs(diff), pct = gap / Math.max(sideTotal(give), sideTotal(get), 1);
    if (pct < 0.07) { box.hidden = true; return; }
    const used = new Set([...give, ...get]);
    const options = [...pool, ...picks].filter((p) => !used.has(p.id) && p.val > 0)
      .sort((a, b) => Math.abs(a.val - gap * 1.05) - Math.abs(b.val - gap * 1.05)).slice(0, 4);
    const who = diff > 0 ? "you could add" : "ask them to add";
    const side = diff > 0 ? "give" : "get";
    box.innerHTML = `<h3 class="ft-b-title">To even it out, ${who} about ${gap.toFixed(1)} in value</h3>
      <ul class="ft-b-list">${options.map((p) => `
        <li><button class="ft-b-add" data-side="${side}" data-id="${p.id}">
          <span class="fd-pos ${p.pos.toLowerCase()}">${p.pos}</span><span class="fd-who"><b>${p.name}</b><span>${sub(p)}</span></span>
          <span class="ft-val">${fmtVal(p.val)}</span><span class="ft-plus" aria-hidden="true">+</span></button></li>`).join("")}</ul>`;
    box.hidden = false;
  }

  // ---------- search ----------
  function search(which) {
    const input = $(`ft-${which}-q`), list = $(`ft-${which}-sug`);
    const q = input.value.trim().toLowerCase();
    if (!q) { list.hidden = true; list.innerHTML = ""; return; }
    const used = new Set([...give, ...get]);
    const hits = [...pool, ...picks].filter((p) => !used.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
    list.innerHTML = hits.map((p, k) => `
      <li role="option" id="ft-${which}-opt-${k}"><button data-side="${which}" data-id="${p.id}">
        <span class="fd-pos ${p.pos.toLowerCase()}">${p.pos}</span><span class="fd-who"><b>${p.name}</b><span>${sub(p)}</span></span>
        <span class="ft-val">${fmtVal(p.val)}</span></button></li>`).join("") || '<li class="ft-none">No player by that name.</li>';
    list.hidden = false;
  }
  function add(side, id) {
    if (!find(id) || give.includes(id) || get.includes(id)) return;
    (side === "give" ? give : get).push(id);
    $("ft-example").hidden = true;
    for (const w of ["give", "get"]) { $(`ft-${w}-q`).value = ""; $(`ft-${w}-sug`).hidden = true; }
    count("trade-analyzer-add", "Added a player to a trade");
    render();
  }

  // ---------- settings ----------
  function renderSettings() {
    document.querySelectorAll("[data-set]").forEach((b) => {
      const on = String(S[b.dataset.set]) === b.dataset.v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on);
    });
    $("ft-kind-note").textContent = S.kind === "dynasty"
      ? "Dynasty: young players count for more, older ones for less. 2027 rookies and rookie picks are in."
      : "Redraft: what each player should score the rest of this season.";
  }

  document.addEventListener("click", (e) => {
    const set = e.target.closest("[data-set]");
    if (set) {
      S[set.dataset.set] = set.dataset.set === "teams" ? Number(set.dataset.v) : set.dataset.v;
      save();
      rank();
      give = give.filter(find); get = get.filter(find);   // picks and rookies drop out of redraft
      render();
      return;
    }
    const x = e.target.closest(".ft-x");
    if (x) {
      if (x.dataset.side === "give") give = give.filter((id) => id !== x.dataset.id);
      else get = get.filter((id) => id !== x.dataset.id);
      render();
      return;
    }
    const pick = e.target.closest("[data-side][data-id]");
    if (pick) { add(pick.dataset.side, pick.dataset.id); return; }
    if (!e.target.closest(".ft-search")) for (const w of ["give", "get"]) $(`ft-${w}-sug`).hidden = true;
  });
  for (const w of ["give", "get"]) {
    $(`ft-${w}-q`).addEventListener("input", () => search(w));
    $(`ft-${w}-q`).addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = $(`ft-${w}-sug`).querySelector("button"); if (first) { e.preventDefault(); add(w, first.dataset.id); } }
      if (e.key === "Escape") $(`ft-${w}-sug`).hidden = true;
    });
  }
  $("ft-clear").addEventListener("click", () => { give = []; get = []; $("ft-example").hidden = true; render(); });
  $("ft-swap").addEventListener("click", () => { [give, get] = [get, give]; render(); });
  $("ft-share").addEventListener("click", () => {
    const note = $("ft-share-note");
    const done = () => { note.textContent = "Link copied. Send it to your league."; count("trade-analyzer-share", "Copied a trade link"); };
    try { navigator.clipboard.writeText(location.href).then(done, () => { note.textContent = location.href; }); }
    catch (e) { note.textContent = location.href; }
  });

  // ---------- start ----------
  rank();
  give = (params.get("give") || "").split(",").filter(find);
  get = (params.get("get") || "").split(",").filter(find);
  if (!give.length && !get.length) {
    // an example so the page shows what it does: one top-25 player for two good starters
    const vets = pool.filter((p) => !p.rookie);
    give = [vets[17].id];
    get = [vets[34].id, vets[46].id];
    $("ft-example").hidden = false;
  }
  render();
})();
