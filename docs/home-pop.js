// Big Head GM home page: tapping a player in the mock draft or the fantasy leaders opens a quick card
// instead of leaving the page. "Full profile" still goes to his page. Ctrl/Cmd-click opens it normally.

(function () {
  const dlg = document.getElementById("pop");
  if (!dlg || typeof dlg.showModal !== "function") return;   // old browsers just follow the link
  const body = document.getElementById("pop-body");
  let prospects = null;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const short = (t) => (t || "").split(" ").pop();
  const count = (path, title) => window.BHG && window.BHG.countEvent ? window.BHG.countEvent(path, title)
    : (window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path, title, event: true }));

  async function loadProspects() {
    if (!prospects) {
      const res = await fetch("data/players.json");
      prospects = new Map((await res.json()).map((p) => [p.name, p]));
    }
    return prospects;
  }

  function gm(team, mood) {
    if (typeof GM === "undefined" || !team) return "";
    return `<span class="pop-gm" style="background:${GM.tint(team)}">${GM.img(team, mood, 72)}</span>`;
  }
  function facts(rows) {
    return `<dl class="pop-facts">${rows.filter((r) => r[1] !== "" && r[1] != null)
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  }
  function statLine(p) {
    const s = p.stats || {};
    if (!s.games) return "";
    const n = (v) => Number(v || 0).toLocaleString("en-US");
    let bits;
    if (p.position === "QB") bits = [`${n(s.pass_yds)} pass yds`, `${n(s.pass_td)} TD`, `${n(s.pass_int)} INT`];
    else if (p.position === "RB") bits = [`${n(s.rush_yds)} rush yds`, `${n(s.rush_td)} TD`].concat(s.rec ? [`${n(s.rec)} catches`] : []);
    else if (p.position === "WR" || p.position === "TE") bits = [`${n(s.rec)} catches`, `${n(s.rec_yds)} yds`, `${n(s.rec_td)} TD`];
    else if (p.position === "OT" || p.position === "IOL") return "";
    else bits = [`${n(s.tackles)} tackles`, `${s.tfl || 0} TFL`, `${s.sacks || 0} sacks`].concat(s.def_int ? [`${s.def_int} INT`] : []);
    return `<p class="pop-stats"><b>${s.season || 2025}:</b> ${bits.join(" · ")} in ${s.games} games</p>`;
  }

  async function openProspect(a) {
    const map = await loadProspects();
    const p = map.get(a.textContent.trim());
    if (!p) { location.href = a.href; return; }
    const ad = p.adp || {};
    const li = a.closest("li");
    const pickNo = li && li.querySelector(".hm-pick") ? li.querySelector(".hm-pick").textContent : "";
    const team = li && li.querySelector(".hm-team") ? li.querySelector(".hm-team").textContent : "";
    body.innerHTML = `
      <div class="pop-head">${gm(ad.team, "happy")}
        <div><p class="pop-eyebrow">#${p.rank} ON THE BIG BOARD</p><h2 class="pop-name">${esc(p.name)}</h2>
        <p class="pop-meta">${esc(p.position)} · ${esc(p.college)}${p.year ? " · " + esc(p.year) : ""}</p></div></div>
      ${pickNo ? `<p class="pop-pick">In our mock: <b>#${esc(pickNo)} to the ${esc(team)}</b></p>` : ""}
      ${facts([["Avg pick", ad.avg ? `#${ad.avg}` : "Undrafted"], ["Range", ad.min ? `#${ad.min}–${ad.max}` : ""],
        ["Height", p.height ? p.height.replace("-", "'") + '"' : ""], ["Weight", p.weight ? `${p.weight} lb` : ""],
        ["Age", p.age ? p.age.toFixed(1) : ""], ["Most often to", ad.team ? `${short(ad.team)} (${ad.teamPct}%)` : ""]])}
      ${statLine(p)}
      <a class="pg-button pop-go" href="${esc(a.getAttribute("href"))}">Full profile →</a>`;
    dlg.showModal();
    count("home-pop-prospect", "Home popup: prospect");
  }

  function openFantasy(a) {
    const li = a.closest("li");
    const d = li.dataset;
    body.innerHTML = `
      <div class="pop-head">${gm(d.team, "happy")}
        <div><p class="pop-eyebrow">${esc(d.pos)}${esc(d.posrank)} IN PPR</p><h2 class="pop-name">${esc(a.textContent)}</h2>
        <p class="pop-meta">${esc(d.pos)} · ${esc(d.team)}</p></div></div>
      ${facts([["PPR PPG", d.ppg], ["PPR points", d.pts], ["GP", d.gp], ["Half PPR", d.half], ["Standard", d.std]])}
      ${d.line ? `<p class="pop-stats"><b>2026:</b> ${esc(d.line)}</p>` : ""}
      <a class="pg-button pop-go" href="${esc(a.getAttribute("href"))}">Full profile →</a>`;
    dlg.showModal();
    count("home-pop-fantasy", "Home popup: fantasy player");
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.hm-name, a.hf-link");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (a.classList.contains("hm-name")) openProspect(a).catch(() => { location.href = a.href; });
    else openFantasy(a);
  });
  document.getElementById("pop-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });   // tap outside the card
})();
