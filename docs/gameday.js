// Big Head GM: Game Day home. "My team" is saved on this phone only (localStorage), no account.
(function () {
  const $ = (id) => document.getElementById(id);
  const D = JSON.parse($("gd-data").textContent);
  const KEY = "bhg-myteam";
  const MAX = 20;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // [name, team, pos, slug, proj, opp, matchup, call, posRank, why, news]
  const BY = {};
  D.players.forEach((p) => { BY[p[3]] = p; });
  const ORDER = { START: 0, FLEX: 1, SIT: 2, OUT: 3, BYE: 4 };
  const MATCH = { g2: "very easy", g1: "easy", n: "average", r1: "tough", r2: "very tough" };
  const TAG = { injury: "Injury", trade: "Trade", qb: "New QB", return: "Return" };

  let team = [];
  try { team = (JSON.parse(localStorage.getItem(KEY)) || []).filter((s) => BY[s]); } catch (e) { team = []; }
  let editing = false;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(team)); } catch (e) { /* private window */ } };

  function row(p) {
    const [n, t, pos, slug, proj, opp, m, call, , why] = p;
    const sub = !opp ? "No game this week" : call === "OUT" ? `vs ${esc(opp)} · not expected to play`
      : `vs ${esc(opp)} · ${MATCH[m] || "average"} matchup · <b>${proj.toFixed(1)}</b> pts`;
    const del = editing ? `<button class="gd-x" data-del="${slug}" aria-label="Remove ${esc(n)}">✕</button>` : "";
    return `<li class="gd-p"><span class="gd-pos ${pos}">${pos}</span>` +
      `<span class="gd-pmain"><a class="gd-name" href="fantasy/${slug}.html">${esc(n)}</a><span class="gd-meta">${esc(t)} ${sub}</span>` +
      `<span class="gd-why">${esc(why)}</span></span>` +
      (editing ? del : `<span class="gd-call ${call}">${call}</span>`) + "</li>";
  }

  function render() {
    const has = team.length > 0;
    $("gd-empty").hidden = has || editing;
    $("gd-edit").hidden = !has || editing;
    $("gd-editor").hidden = !editing;
    const ps = team.map((s) => BY[s]).sort((a, b) => ORDER[a[7]] - ORDER[b[7]] || b[4] - a[4]);
    $("gd-list").innerHTML = ps.map(row).join("");
    const news = ps.filter((p) => p[10]).map((p) => {
      const [kind, text, date] = p[10];
      const d = new Date(date + "T12:00:00");
      return `<li class="nw-item"><span class="nw-tag ${esc(kind)}">${TAG[kind] || "News"}</span><span class="nw-text">${esc(text)} ` +
        `<span class="nw-meta"><time datetime="${date}">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></span></span></li>`;
    });
    $("gd-news").hidden = editing || !news.length;
    $("gd-news-list").innerHTML = news.join("");
    $("gd-fine").textContent = editing ? `${team.length} of ${MAX} players · saved on this phone` : "Saved on this phone. No account needed. PPR.";
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
    if (on) { $("gd-q").value = ""; suggest(); $("gd-q").focus(); }
  }

  $("gd-add").addEventListener("click", () => open(true));
  $("gd-edit").addEventListener("click", () => open(true));
  $("gd-done").addEventListener("click", () => open(false));
  $("gd-q").addEventListener("input", suggest);
  $("gd-sug").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b || team.length >= MAX) return;
    team.push(b.dataset.add); save();
    $("gd-q").value = ""; suggest(); render(); $("gd-q").focus();
  });
  $("gd-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    team = team.filter((s) => s !== b.dataset.del); save(); render();
  });
  render();
})();
