// Big Head GM: fantasy start/sit helper. Who should I start this week?
// Numbers come from the JSON that build_pages.py puts in the page (rest-of-season projections + trends).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const D = JSON.parse($("ss-data").textContent);
  const TEAM = { ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears",
    CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans",
    IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins",
    MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers",
    SF: "49ers", SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const count = (path, title) => { try { window.BHG && BHG.countEvent(path, title); } catch (e) { /* ignore */ } };
  const bySlug = Object.fromEntries(D.players.map((p) => [p.slug, p]));
  const params = new URLSearchParams(location.search);

  let fmt = "ppr", n = 1, picked = [];
  try { fmt = localStorage.getItem("bhg-ff-format") || fmt; } catch (e) { /* private window */ }
  if (params.get("fmt")) fmt = params.get("fmt");
  if (!["std", "half", "ppr", "tep"].includes(fmt)) fmt = "ppr";
  if (params.get("n")) n = Math.max(1, Math.min(3, Number(params.get("n")) || 1));

  const grade = (m) => (!m ? "bye" : m >= 1.1 ? "g2" : m >= 1.04 ? "g1" : m > 0.96 ? "n" : m > 0.9 ? "r1" : "r2");
  const word = { g2: "Easy matchup", g1: "Good matchup", n: "Average matchup", r1: "Tough matchup", r2: "Very tough matchup", bye: "On bye" };
  const proj = (p) => (p.m ? p.ppg[fmt] * p.m * (p.a == null ? 1 : p.a) * (p.q || 1) : 0);
  function injLabel(p) {
    const i = p.inj;
    if (!i) return "";
    const what = i.inj ? ` (${i.inj.split(" (")[0].toLowerCase()})` : "";
    if (i.s === "season") return `Out for the season${what}`;
    if (p.a === 0) return (i.s === "ir" ? "On IR" : "Out") + what + (i.back && i.back < 99 ? `. Expected back about Week ${i.back}` : "");
    if (i.s === "doubtful") return `Doubtful${what}`;
    if (i.s === "questionable") return `Questionable${what}`;
    return "";
  }
  const range = (p) => { const x = proj(p), s = p.sd * 0.85; return [Math.max(0, x * (1 - s)), x * (1 + s)]; };
  const span = D.span[0] ? (D.span[0] === D.span[1] ? `Week ${D.span[1]}` : `Weeks ${D.span[0]}–${D.span[1]}`) : "";

  // Why the starter beats the next guy, in plain words (up to 2 reasons)
  function reasons(a, b) {
    const out = [];
    if (!b.m) return [`${b.n} is on bye this week.`];
    if (b.a === 0) return [`${b.n} is out this week: ${injLabel(b).toLowerCase()}.`];
    if (b.a < 1 && b.inj) out.push(`${b.n} is ${b.inj.s} this week${b.inj.inj ? " (" + b.inj.inj.split(" (")[0].toLowerCase() + ")" : ""}.`);
    if (b.out) out.push(`${b.n} hasn't played since Week ${b.out}.`);
    if (a.fill && !b.fill) out.push(`More work: ${a.fill.for.join(" and ")} ${a.fill.for.length > 1 ? "are" : "is"} out, so ${a.n} should get more of the ball.`);
    if (a.qb && a.qb.m > 1 && !(b.qb && b.qb.m > 1)) out.push(`New quarterback: ${a.qb.name}${a.qb.status === "expected" ? " is expected to start" : " takes over"}, an upgrade for ${a.n}.`);
    if (b.qb && b.qb.m < 1) out.push(`${b.n}'s team has a new quarterback (${b.qb.name}), a step down.`);
    if (a.m - b.m >= 0.06) out.push(`Easier matchup: ${a.n} faces the ${TEAM[a.opp] || a.opp} (${word[grade(a.m)].replace(" matchup", "").toLowerCase()}), ${b.n} faces the ${TEAM[b.opp] || b.opp} (${word[grade(b.m)].replace(" matchup", "").toLowerCase()}).`);
    if (a.hot && b.hot && (a.hot[1] - a.hot[0]) - (b.hot[1] - b.hot[0]) >= 3) out.push(`Hotter lately: ${a.hot[1].toFixed(1)} PPR points a game in ${span}, up from ${a.hot[0].toFixed(1)}.`);
    if (a.use && b.use && a.use[1] - b.use[1] >= 3) out.push(`More touches lately: ${a.use[1].toFixed(1)} a game vs ${b.use[1].toFixed(1)}.`);
    if (a.ppg[fmt] - b.ppg[fmt] >= 1.5) out.push(`Scores more: ${a.ppg[fmt].toFixed(1)} points a game vs ${b.ppg[fmt].toFixed(1)}.`);
    if (!out.length) out.push("Slightly higher projection. Go with your gut if you have news we don't.");
    return out.slice(0, 2);
  }

  function render() {
    for (const b of document.querySelectorAll("#ss-fmt .filter")) { const on = b.dataset.fmt === fmt; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); }
    for (const b of document.querySelectorAll("#ss-n .filter")) { const on = Number(b.dataset.n) === n; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); }
    const ps = picked.map((s) => bySlug[s]).filter(Boolean).sort((a, b) => proj(b) - proj(a));
    const start = Math.min(n, Math.max(1, ps.length - 1));
    $("ss-cards").innerHTML = ps.map((p, i) => {
      const g = grade(p.m), [lo, hi] = range(p);
      const tag = i < start ? '<span class="ss-tag ss-go">START</span>' : '<span class="ss-tag ss-no">SIT</span>';
      const lately = p.hot ? `<span>Lately: ${p.hot[1].toFixed(1)} PPR a game (was ${p.hot[0].toFixed(1)})${p.use ? ` · ${p.use[1].toFixed(1)} touches (was ${p.use[0].toFixed(1)})` : ""}</span>` : "";
      const out = injLabel(p) ? `<span class="ss-warn">${injLabel(p)}.</span>` : p.out ? `<span class="ss-warn">Hasn't played since Week ${p.out}. Check his status.</span>` : "";
      return `<li class="ss-card ${i < start ? "is-start" : "is-sit"}">
        <div class="ss-top">${tag}<span class="fd-pos ${p.p.toLowerCase()}">${p.p}</span>
          <span class="fd-who"><b><a href="fantasy/${p.slug}.html">${esc(p.n)}</a></b><span>${esc(TEAM[p.t] || p.t)}</span></span>
          <span class="ss-proj"><b>${proj(p).toFixed(1)}</b><i>${!p.m ? "bye" : p.a === 0 ? "out" : `${lo.toFixed(0)}–${hi.toFixed(0)} range`}</i></span>
          <button class="ft-x" data-rm="${p.slug}" aria-label="Remove ${esc(p.n)}">✕</button></div>
        <div class="ss-meta"><span class="rs-m ${g}">${p.opp ? "vs " + p.opp : "BYE"}</span><span>${word[g]}${p.opp ? ` (${esc(TEAM[p.opp] || p.opp)})` : ""}</span></div>
        <div class="ss-meta">${lately}${out}${p.qb ? `<span class="rs-qb ${p.qb.m > 1 ? "up" : "down"}">New QB: ${esc(p.qb.name)}${p.qb.status === "expected" ? " (expected)" : ""} ${p.qb.m > 1 ? "↑" : "↓"}</span>` : ""}${p.fill ? `<span class="rs-qb up">More work: ${esc(p.fill.for.join(", "))} out ↑</span>` : ""}</div>
      </li>`;
    }).join("") || '<li class="ft-empty">Add at least two players.</li>';
    verdict(ps, start);
    const q = new URLSearchParams({ p: picked.join(","), fmt, n });
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }

  function verdict(ps, start) {
    const box = $("ss-verdict");
    if (ps.length < 2) { box.className = "ss-verdict"; box.innerHTML = `<p class="ft-v-title">Who are you deciding between?</p><p class="ft-v-sub">Add two or more players below.</p>`; return; }
    const winners = ps.slice(0, start), next = ps[start];
    const a = winners[winners.length - 1];
    const gap = proj(a) - proj(next), pct = gap / Math.max(1, proj(a));
    const names = winners.map((p) => p.n).join(" and ");
    const title = pct < 0.05 ? `Coin flip. Lean ${names}.` : pct < 0.15 ? `Start ${names}.` : `Easy call: start ${names}.`;
    box.className = `ss-verdict ${pct < 0.05 ? "close" : "clear"}`;
    box.innerHTML = `<p class="ss-v-eyebrow">WEEK ${D.week}${D.when ? " · " + D.when.toUpperCase() : ""}</p><p class="ft-v-title">${esc(title)}</p>
      <ul class="ss-why">${reasons(a, next).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  }

  // ---------- search ----------
  function search() {
    const q = $("ss-q").value.trim().toLowerCase(), list = $("ss-sug");
    if (!q) { list.hidden = true; return; }
    const hits = D.players.filter((p) => !picked.includes(p.slug) && p.n.toLowerCase().includes(q))
      .sort((a, b) => proj(b) - proj(a)).slice(0, 8);
    list.innerHTML = hits.map((p) => `<li role="option"><button data-add="${p.slug}">
      <span class="fd-pos ${p.p.toLowerCase()}">${p.p}</span><span class="fd-who"><b>${esc(p.n)}</b><span>${esc(TEAM[p.t] || p.t)} · ${p.opp ? "vs " + p.opp : "bye"}</span></span>
      <span class="ft-val">${proj(p).toFixed(1)}</span></button></li>`).join("") || '<li class="ft-none">No player by that name.</li>';
    list.hidden = false;
  }
  function add(slug) {
    if (!bySlug[slug] || picked.includes(slug) || picked.length >= 6) return;
    picked.push(slug);
    $("ss-q").value = ""; $("ss-sug").hidden = true; $("ss-example").hidden = true;
    count("start-sit-add", "Added a player to start/sit");
    render();
  }

  document.addEventListener("click", (e) => {
    const f = e.target.closest("#ss-fmt [data-fmt]");
    if (f) { fmt = f.dataset.fmt; try { localStorage.setItem("bhg-ff-format", fmt); } catch (er) { /* private */ } render(); return; }
    const k = e.target.closest("#ss-n [data-n]");
    if (k) { n = Number(k.dataset.n); render(); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { picked = picked.filter((s) => s !== rm.dataset.rm); render(); return; }
    const ad = e.target.closest("[data-add]");
    if (ad) { add(ad.dataset.add); return; }
    if (!e.target.closest(".ss-search")) $("ss-sug").hidden = true;
  });
  $("ss-q").addEventListener("input", search);
  $("ss-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("ss-sug").querySelector("[data-add]"); if (first) { e.preventDefault(); add(first.dataset.add); } }
    if (e.key === "Escape") $("ss-sug").hidden = true;
  });
  $("ss-clear").addEventListener("click", () => { picked = []; $("ss-example").hidden = true; render(); $("ss-q").focus(); });
  $("ss-share").addEventListener("click", () => {
    const note = $("ss-share-note");
    const done = () => { note.textContent = "Link copied. Send it to your league."; count("start-sit-share", "Copied a start/sit link"); };
    try { navigator.clipboard.writeText(location.href).then(done, () => { note.textContent = location.href; }); }
    catch (er) { note.textContent = location.href; }
  });

  // ---------- start ----------
  picked = (params.get("p") || "").split(",").filter((s) => bySlug[s]);
  if (!picked.length) {
    // example: two receivers who are close this week, so it shows a real decision
    const wrs = D.players.filter((p) => p.p === "WR" && p.m && !p.out && !p.inj).sort((a, b) => proj(b) - proj(a));
    picked = [wrs[14].slug, wrs[16].slug];
    $("ss-example").hidden = false;
  }
  render();
})();
