// Big Head GM: "Your lineup this week". The team and league settings are saved on this device only
// (localStorage), no account. We fill the league's starting spots with the best projections this week.
(function () {
  const $ = (id) => document.getElementById(id);
  const D = JSON.parse($("gd-data").textContent);
  const KEY = "bhg-myteam", SET_KEY = "bhg-myteam-league";
  const MAX = 25;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // [name, team, pos, slug, [std, half, ppr] projection, opp, matchup, call, posRank, why, news,
  //  actual this week once his game is final: [std, half, ppr, stat line] or null,
  //  PPR points a game over the next few weeks (this week counts most)]
  const BY = {};
  D.players.forEach((p) => { BY[p[3]] = p; });
  const MATCH = { g2: "very easy", g1: "easy", n: "average", r1: "tough", r2: "very tough" };
  const TAG = { injury: "Injury", trade: "Trade", qb: "New QB", return: "Return", result: "Final" };
  const FMT = [["ppr", "PPR", 2], ["half", "Half PPR", 1], ["std", "Standard", 0]];
  // starting spots: label, who can fill it, how many allowed
  const SLOTS = [
    ["QB", "QB", ["QB"], 1, 2], ["RB", "RB", ["RB"], 0, 4], ["WR", "WR", ["WR"], 0, 5], ["TE", "TE", ["TE"], 0, 3],
    ["FLEX", "Flex", ["RB", "WR", "TE"], 0, 4], ["SF", "Superflex", ["QB", "RB", "WR", "TE"], 0, 2],
    ["K", "K", ["K"], 0, 2], ["DEF", "D/ST", ["DEF"], 0, 2],
  ];
  const DEF = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0, K: 1, DEF: 1, fmt: "ppr" };
  const KD = (pos) => pos === "K" || pos === "DEF";
  const posLabel = (pos) => (pos === "DEF" ? "D/ST" : pos);

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
      return `<li class="gd-p gd-edit-row"><span class="gd-pos ${pos}">${posLabel(pos)}</span><span class="gd-pmain"><b class="gd-name">${esc(n)}</b>` +
        `<span class="gd-meta">${esc(t)}</span></span><button class="gd-x" data-del="${slug}" aria-label="Remove ${esc(n)}">✕</button></li>`;
    }
    const act = p[11];
    const sub = act ? `· final vs ${esc(opp)} · <b>${act[fi()].toFixed(1)}</b> pts (proj ${pts(p).toFixed(1)})`
      : call === "OUT" ? "Not expected to play" : !opp ? "Bye this week"
      : `vs ${esc(opp)} · ${MATCH[m] || "average"} · <b>${pts(p).toFixed(1)}</b> pts`;
    const pill = act ? `<span class="gd-call DONE"><small>FINAL</small>${act[fi()].toFixed(1)}</span>`
      : slot ? `<span class="gd-call START">START</span>` : `<span class="gd-call ${out ? call : "BENCH"}">${out ? call : "BENCH"}</span>`;
    const chip = slot && (slot === "FLEX" || slot === "SF") ? `<span class="gd-pos ${pos} gd-flex">${slot}</span>` : `<span class="gd-pos ${pos}">${posLabel(pos)}</span>`;
    const nameHtml = KD(pos) ? `<b class="gd-name">${esc(n)}</b>` : `<a class="gd-name" href="fantasy/${slug}.html">${esc(n)}</a>`;
    return `<li class="gd-p${slot ? "" : " gd-bench"}${act ? " gd-played" : ""}">${chip}` +
      `<span class="gd-pmain">${nameHtml}<span class="gd-meta">${esc(t)}${slot === "FLEX" || slot === "SF" ? " " + pos : ""} ${sub}</span>` +
      `<span class="gd-why">${esc(act ? act[3] : (note || why))}</span></span>${pill}</li>`;
  }

  function lastName(p) { return p[0].split(" ").slice(-1)[0]; }

  function renderList() {
    const ps = team.map((s) => BY[s]);
    if (!ps.length) { $("gd-list").innerHTML = ""; return; }
    if (editing) {
      $("gd-list").innerHTML = ps.slice().sort((a, b) => pts(b) - pts(a)).map((p) => row(p, null)).join("");
      return;
    }
    const { starters, bench } = lineup(ps);
    const html = starters.map((s) => {
      if (!s.p) return `<li class="gd-p gd-open"><span class="gd-pos">${s.slot}</span><span class="gd-pmain"><b>Empty ${s.slot === "SF" ? "Superflex" : s.slot === "FLEX" ? "Flex" : posLabel(s.slot)} spot</b>` +
        `<span class="gd-meta">Add ${s.can[0] === "K" ? "a kicker" : s.can[0] === "DEF" ? "a defense" : (["QB", "TE", "WR"].includes(s.can[0]) ? "a " : "an ") + (s.can.length > 1 ? s.can.slice(0, -1).join(", ") + " or " + s.can[s.can.length - 1] : s.can[0])} to fill it</span></span></li>`;
      return row(s.p, s.slot);
    });
    const close = (b) => {                       // a bench player within a point of someone he could replace
      if (!plays(b)) return "";
      const rival = starters.filter((s) => s.p && s.can.includes(b[2])).sort((x, y) => pts(x.p) - pts(y.p))[0];
      return rival && pts(rival.p) - pts(b) <= 1 ? `Close call with ${lastName(rival.p)} (${pts(rival.p).toFixed(1)} pts)` : "";
    };
    if (bench.length) html.push(`<li class="gd-sep">Bench</li>`, ...bench.map((b) => row(b, null, close(b))));
    const st = starters.filter((x) => x.p);
    const played = st.filter((x) => x.p[11]);
    if (played.length) {
      const got = played.reduce((t, x) => t + x.p[11][fi()], 0);
      const rest = st.filter((x) => !x.p[11]).reduce((t, x) => t + (plays(x.p) ? pts(x.p) : 0), 0);
      html.unshift(`<li class="gd-total"><span><b>${got.toFixed(1)}</b> pts so far from ${played.length} starter${played.length > 1 ? "s" : ""}</span>` +
        `<span>${played.length < st.length ? `On pace for <b>${(got + rest).toFixed(1)}</b>` : "Final"}</span></li>`);
    }
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
    const spots = SLOTS.filter(([k]) => L[k]).map(([k]) => `${L[k]} ${k === "SF" ? "Superflex" : k === "FLEX" ? "Flex" : posLabel(k)}`).join(", ");
    const fmt = (FMT.find((f) => f[0] === L.fmt) || FMT[0])[1];
    renderExtras();
    $("gd-fine").textContent = editing ? `${team.length} of ${MAX} players · saved on this device`
      : `${fmt} · starts ${spots}. Saved on this device. No account needed.`;
  }

  // starters to double-check before kickoff (questionable or doubtful, still in the lineup)
  function alerts(starters) {
    const risky = starters.filter((s) => s.p && !s.p[11] && /^(Questionable|Doubtful)/.test(s.p[9]));
    return risky.map((s) => `<b>${esc(s.p[0])}</b> is ${esc(s.p[9].charAt(0).toLowerCase() + s.p[9].slice(1))}`);
  }

  // waiver pickups who project better over the next few weeks than your weakest player at his position
  function upgrades(ps, starters) {
    if (!D.ww) return [];
    const out = [];
    for (const [slug, avg, why] of D.ww) {
      const w = BY[slug];
      if (!w || team.includes(slug)) continue;
      const pos = w[2];
      const mine = ps.filter((p) => p[2] === pos).sort((a, b) => (a[12] || 0) - (b[12] || 0));
      const openSpot = starters.some((s) => !s.p && s.can.includes(pos) && s.can.length === 1);
      if (openSpot) { out.push({ w, avg, why, over: null, gain: avg }); continue; }
      if (!mine.length || KD(pos) && mine.length > 1) continue;
      const worst = mine[0];
      if (avg - (worst[12] || 0) >= 1.5) out.push({ w, avg, why, over: worst, gain: avg - (worst[12] || 0) });
    }
    const seen = new Set();                         // one pickup per player you'd replace
    return out.sort((a, b) => b.gain - a.gain).filter((u) => {
      const k = u.over ? u.over[3] : "open-" + u.w[2];
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }

  // in the iPhone app: the game-day alerts switch, and this week's lineup for Sunday's alert
  function appAlerts(starters) {
    const ps = $("gd-push"), B = window.BHGPush;
    if (ps && B) {
      ps.hidden = false;
      const pb = ps.querySelector("input");
      pb.checked = B.on();
      if (!pb.dataset.on) {
        pb.dataset.on = "1";
        // notifications were turned off for the app before: iPhone won't ask again, so offer Settings
        const note = () => {
          let n = ps.parentElement.querySelector(".gd-push-note");
          if (!n) {
            n = document.createElement("div");
            n.className = "gd-push-note";
            n.innerHTML = '<span>Notifications are off for Big Head GM on this phone. Turn on <b>Allow Notifications</b>, then come back.</span>' +
              '<a class="mt-btn" href="app-settings:">Open Settings</a>';
            ps.after(n);
          }
          return n;
        };
        const update = () => {
          const n = ps.parentElement.querySelector(".gd-push-note");
          if (B.error === "denied") note().hidden = false;
          else if (n) n.hidden = true;
        };
        pb.addEventListener("change", async () => {
          pb.checked = await B.set(pb.checked);
          update();
        });
        // back from Settings with notifications on: finish turning alerts on
        document.addEventListener("visibilitychange", async () => {
          const n = ps.parentElement.querySelector(".gd-push-note");
          if (document.visibilityState !== "visible" || !n || n.hidden) return;
          if (await B.granted()) { pb.checked = await B.set(true); update(); }
        });
      }
      if (!ps.nextElementSibling || !ps.nextElementSibling.classList.contains("gd-push-chk")) {
        ps.insertAdjacentHTML("afterend", '<a class="gd-push-chk" href="my-team.html?pushcheck=1">Not getting alerts? Run a check</a>');
      }
      B.sync();                                   // follow players just added, drop ones removed
    }
    const sw = $("gd-alerts"), A = window.BHGApp;
    if (!sw || !A) return;
    sw.hidden = false;
    const box = sw.querySelector("input");
    box.checked = A.teamAlertsOn();
    if (!box.dataset.on) {
      box.dataset.on = "1";
      box.addEventListener("change", async () => { box.checked = await A.setTeamAlerts(box.checked); });
    }
    const st = starters.filter((s) => s.p);
    A.teamBrief({
      week: D.week,
      risky: st.filter((s) => !s.p[11] && /^(Questionable|Doubtful)/.test(s.p[9])).map((s) => `${lastName(s.p)} (${s.p[9].split(/[ (:]/)[0].toLowerCase()})`),
      empty: starters.length - st.length,
      total: st.reduce((t, s) => t + pts(s.p), 0).toFixed(1),
    });
  }

  function renderExtras() {
    const ps = team.map((s) => BY[s]);
    const box = $("gd-ups"), al = $("gd-alert");
    if (!box || !al) return;
    if (editing || !ps.length) {
      box.hidden = true; al.hidden = true;
      for (const id of ["gd-alerts", "gd-push"]) if ($(id)) $(id).hidden = true;
      if (!editing && window.BHGPush) window.BHGPush.sync();
      return;
    }
    const { starters } = lineup(ps);
    const warn = alerts(starters);
    al.hidden = !warn.length;
    al.innerHTML = warn.length ? `<span class="gd-alert-i" aria-hidden="true">!</span><span>Check before kickoff: ${warn.join("; ")}.</span>` : "";
    appAlerts(starters);
    const max = Number(box.dataset.max) || 2;
    const ups = upgrades(ps, starters).slice(0, max);
    box.hidden = !ups.length;
    const wk = D.soon && D.soon[0] !== D.soon[1] ? `Weeks ${D.soon[0]}–${D.soon[1]}` : `Week ${D.week}`;
    $("gd-ups-list").innerHTML = ups.map(({ w, avg, why, over }) => {
      const nm = KD(w[2]) ? `<b class="gd-name">${esc(w[0])}</b>` : `<a class="gd-name" href="fantasy/${w[3]}.html">${esc(w[0])}</a>`;
      const vs = over ? `Projects ${avg.toFixed(1)} PPR a game (${wk}), vs ${(over[12] || 0).toFixed(1)} for ${esc(over[0])}.`
        : `You have no ${posLabel(w[2])}. He projects ${avg.toFixed(1)} a game (${wk}).`;
      return `<li class="gd-p gd-up"><span class="gd-pos ${w[2]}">${posLabel(w[2])}</span><span class="gd-pmain">${nm}` +
        `<span class="gd-meta">${esc(w[1])} · ${vs}</span><span class="gd-why">${esc(why)}</span></span>` +
        `<span class="gd-call ADD">ADD</span></li>`;
    }).join("");
  }

  function suggest() {
    const q = $("gd-q").value.trim().toLowerCase();
    const box = $("gd-sug");
    if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    const hay = (p) => (p[0] + (p[2] === "DEF" ? " defense dst def" : p[2] === "K" ? " kicker" : "")).toLowerCase();
    const hits = D.players.filter((p) => !team.includes(p[3]) && hay(p).includes(q)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((p) =>
      `<li><button type="button" data-add="${p[3]}"><span class="gd-pos ${p[2]}">${posLabel(p[2])}</span><span>${esc(p[0])} <span class="gd-meta">${esc(p[1])}</span></span></button></li>`).join("")
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
