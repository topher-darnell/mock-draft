"""
Builds the website's read-only pages from the data, so search engines can find them:

  docs/players/index.html        the full big board
  docs/players/<player>.html     one profile page per prospect
  docs/teams/index.html          all 32 teams
  docs/teams/<team>.html         one mock draft page per team
  docs/odds.html                 who goes #1: our simulations next to the betting odds
  docs/games/*.html              the games hub and the two games (their code is games/*.js)
  docs/sitemap.xml, robots.txt   the list of pages for Google

Run it after export_json.py, from the mockdraft folder:
    python3 auto_mocks.py 1000 --save
    python3 export_json.py
    python3 build_pages.py

It reads docs/data/*.json plus sim_first.csv, sim_teams.csv, gm_info.csv and
market_odds.csv (the sportsbook odds, typed in by hand with their date and source).
"""

import csv
import datetime
import html
import json
import os
import re

import consensus
import fantasy

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, "..", "docs"))
SITE = "https://bigheadgm.com/"
DRAFT_DATE = "April 29, 2027"
CSS_V, GM_V, SITE_JS_V = "44", "5", "1"       # bump with the files in index.html
ICON_V = "4"
TODAY = datetime.date.today()

POS_NAME = {"QB": "quarterback", "RB": "running back", "WR": "wide receiver", "TE": "tight end",
            "OT": "offensive tackle", "IOL": "interior offensive lineman", "EDGE": "edge rusher",
            "IDL": "interior defensive lineman", "LB": "linebacker", "CB": "cornerback", "S": "safety"}
POS_PLURAL = {"QB": "quarterbacks", "RB": "running backs", "WR": "wide receivers", "TE": "tight ends",
              "OT": "offensive tackles", "IOL": "interior offensive linemen", "EDGE": "edge rushers",
              "IDL": "interior defensive linemen", "LB": "linebackers", "CB": "cornerbacks", "S": "safeties"}
POS_ORDER = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"]
YEAR_NAME = {"RS Senior": "redshirt senior", "RS Junior": "redshirt junior", "RS Sophomore": "redshirt sophomore"}

NAV = [("", "Mock draft"), ("players/", "Big board"), ("teams/", "Team mocks"), ("odds.html", "#1 pick odds"),
       ("insights.html", "1,000 drafts"), ("fantasy.html", "Fantasy"), ("games/", "Games")]


# ---------- small helpers ----------

def esc(text):
    return html.escape(str(text), quote=True)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "").replace(".", "")).strip("-")


def read_csv(name):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_json(name):
    with open(os.path.join(DOCS, "data", name), encoding="utf-8") as f:
        return json.load(f)


def ordinal(n):
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def feet(h):
    parts = str(h or "").split("-")
    return f"{parts[0]}'{parts[1]}\"" if len(parts) == 2 else (h or "—")


def num(v):
    return f"{v:,}" if isinstance(v, int) else str(v)


def pct(v):
    return f"{round(v)}%"


def a_or_an(word):
    return "an" if word[0].lower() in "aeiou" else "a"


def american(prob):
    """a chance (0-100) as American odds, rounded the way sportsbooks show them"""
    p = max(0.5, min(99.5, prob)) / 100
    if p >= 0.5:
        return f"-{int(round(100 * p / (1 - p) / 5) * 5)}"
    raw = 100 * (1 - p) / p
    step = 5 if raw < 400 else 25 if raw < 1000 else 100 if raw < 5000 else 500
    return f"+{int(round(raw / step) * step)}"


def implied(odds):
    """American odds as a chance (0-100)"""
    n = int(str(odds).replace("+", ""))
    return 100 * (100 / (n + 100) if n > 0 else -n / (-n + 100))


def nice_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def write(path, text):
    full = os.path.join(DOCS, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


# ---------- the shared page shell ----------

def page(path, title, description, body, crumbs=None, nav="", scripts=(), body_class="info-page", og_title=None):
    """path: where the page lives inside docs/. crumbs: [(label, path)] for the breadcrumb trail."""
    root = "../" * path.count("/")
    url = SITE + (path[:-len("index.html")] if path.endswith("index.html") else path)
    links = "".join(
        f'<a href="{(root + href) if href else (root or "./")}"'
        + (' aria-current="page"' if href == nav else "") + f">{esc(label)}</a>"
        for href, label in NAV)
    ld = ""
    trail = ""
    if crumbs:
        items = [("Big Head GM", "")] + crumbs
        ld = '<script type="application/ld+json">' + json.dumps({
            "@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": label, "item": SITE + href}
                                for i, (label, href) in enumerate(items)]}) + "</script>"
        trail = '<nav class="pg-crumbs" aria-label="You are here">' + " <span>›</span> ".join(
            f'<a href="{root}{href or "./"}">{esc(label)}</a>' for label, href in [("Home", "")] + crumbs[:-1]) + \
            f' <span>›</span> <b>{esc(crumbs[-1][0])}</b></nav>'
    tags = "".join(f'\n  <script src="{root}{s}"></script>' for s in scripts)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Big Head GM">
  <meta property="og:title" content="{esc(og_title or title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}icons/og-image.jpg?v={ICON_V}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="{root}manifest.json?v=3">
  <link rel="apple-touch-icon" href="{root}icons/apple-touch-icon.png?v={ICON_V}">
  <link rel="icon" type="image/png" sizes="32x32" href="{root}icons/favicon-32.png?v={ICON_V}">
  <meta name="theme-color" content="#10151C">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,700;0,900;1,900&family=Space+Grotesk:wght@600;700&display=swap">
  <link rel="stylesheet" href="{root}style.css?v={CSS_V}">
  {ld}
</head>
<body class="{body_class}">

  <header class="site-header">
    <div class="wrap header-row">
      <a class="brand" href="{root or './'}" aria-label="Big Head GM home">
        <span class="brand-tile"><img src="{root}icons/mascot-head.png?v={ICON_V}" alt="" width="40" height="40"></span>
        <span class="brand-word">BIG HEAD <span>GM</span></span>
      </a>
      <a class="header-cta" href="{root}?start=1">Start <span class="cta-long">mock </span>draft</a>
    </div>
  </header>
  <nav class="site-nav" aria-label="Site"><div class="wrap site-nav-row">{links}</div></nav>

  <main class="wrap pg-main">
    {trail}
{body}
  </main>

  <footer class="site-footer">
    <div class="wrap footer-row">
      <img class="footer-logo" src="{root}icons/logo-banner-small.webp?v={ICON_V}" alt="Big Head GM" width="400" height="225" loading="lazy">
      <div class="footer-text">
        <p><b>Big Head GM</b> · a free 2027 NFL mock draft simulator. <a href="{root}?start=1">Run your own mock</a></p>
        <p>Big board: Pro Football Network consensus · Draft order: Tankathon · Team needs: NFL.com · Updated {TODAY.strftime('%B')} {TODAY.day}, {TODAY.year}</p>
        <p>Not affiliated with the NFL or any NFL team. Every GM is an original character.</p>
      </div>
    </div>
  </footer>

  <script src="{root}gm.js?v={GM_V}"></script>
  <script src="{root}site.js?v={SITE_JS_V}"></script>
  <script src="{root}newsletter.js?v=1"></script>{tags}
  <!-- Visit counter: GoatCounter (no cookies, no personal data). Stats: https://topherdarnell.goatcounter.com -->
  <script data-goatcounter="https://topherdarnell.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
"""


def signup(src):
    """the "weekly mock in your inbox" box; newsletter.js turns it on"""
    return """<section class="nl" data-from="{src}" hidden>
      <h2>Get the weekly mock</h2>
      <p>One email a week: the new top 10, the biggest risers and fallers, and the #1 pick odds. Free, no spam, unsubscribe anytime.</p>
      <form class="nl-form" method="post">
        <label class="sr-only" for="nl-email-{src}">Email address</label>
        <input id="nl-email-{src}" type="email" name="email_address" placeholder="you@email.com" autocomplete="email" required>
        <button class="pg-button" type="submit">Sign up</button>
      </form>
      <p class="nl-note" role="status"></p>
    </section>""".replace("{src}", src)


def gm_tag(team, mood="neutral", size=44, cls="avatar"):
    """an empty tile that site.js fills with the team's GM"""
    return f'<span class="{cls}" data-gm="{esc(team)}" data-mood="{mood}" data-size="{size}"></span>'


# ---------- load everything ----------

players = read_json("players.json")
teams = read_json("teams.json")
order = read_json("draft_order.json")
sims = read_json("sims.json")
SIMS = f"{sims['sims']:,}"
gm_info = {r["team"]: r for r in read_csv("gm_info.csv")}
by_name = {p["name"]: p for p in players}
by_pos = {}
for p in players:
    by_pos.setdefault(p["position"], []).append(p)
for p in players:
    p["slug"] = slug(p["name"])
    p["pos_rank"] = by_pos[p["position"]].index(p) + 1
assert len({p["slug"] for p in players}) == len(players), "two players share a page name"
needs = {t["name"]: t["needs"] for t in teams}
team_names = sorted(needs)
round_of = {o["pick"]: o["round"] for o in order}
slots_by_team = {}
for s in sims["slots"]:
    slots_by_team.setdefault(s["team"], []).append(s)
MOCK_LIST = consensus.build()                       # [(slot, player)] for every pick, in order
MOCK = {s_["pick"]: p for s_, p in MOCK_LIST}
favorites = {}
for r in read_csv("sim_teams.csv"):
    favorites.setdefault(r["team"], []).append((r["name"], r["position"], float(r["pct"])))


def short(team):
    return gm_info.get(team, {}).get("short") or team.split(" ")[-1]


def player_link(name, root, text=None, cls=""):
    p = by_name.get(name)
    label = esc(text or name)
    c = f' class="{cls}"' if cls else ""
    return f'<a{c} href="{root}players/{p["slug"]}.html">{label}</a>' if p else label


def team_link(team, root, text=None):
    return f'<a href="{root}teams/{slug(team)}.html">{esc(text or team)}</a>'


def projection(p):
    """a short label and a sentence for where he's likely to go"""
    a = p.get("adp") or {}
    if not a.get("avg"):
        return "Undrafted", f"He went undrafted in all {SIMS} simulated drafts, so he projects as a priority free agent for now."
    avg = a["avg"]
    rnd = round_of.get(min(max(1, round(avg)), len(order)), 7)
    if a["pct"] < 50:
        label = "Late rounds"
    elif avg <= 5.5:
        label = "Top-5 pick"
    elif avg <= 10.5:
        label = "Top-10 pick"
    elif rnd == 1:
        label = "Round 1"
    else:
        label = f"Round {rnd}"
    often = "" if a["pct"] >= 100 else f" He was drafted in {a['pct']:g}% of them."
    text = (f"Across {SIMS} simulated drafts he came off the board at pick {avg:g} on average "
            f"(round {rnd}), as early as #{a['min']} and as late as #{a['max']}.{often}")
    return label, text


# ---------- stats, the same sets the player card uses ----------

def ratio(a, b, digits=1, scale=1):
    return f"{scale * a / b:.{digits}f}" if a and b else None


def stat_tiles(p):
    s = p.get("stats")
    if not s:
        return []
    g = s.get
    pos = p["position"]
    if pos == "QB":
        rows = [("Pass yds", g("pass_yds")), ("Pass TD", g("pass_td")), ("INT", g("pass_int")),
                ("Comp %", ratio(g("pass_cmp"), g("pass_att"), 1, 100)), ("Rush yds", g("rush_yds")), ("Rush TD", g("rush_td"))]
    elif pos == "RB":
        rows = [("Rush yds", g("rush_yds")), ("Rush TD", g("rush_td")), ("Yds/carry", ratio(g("rush_yds"), g("rush_att"))),
                ("Catches", g("rec")), ("Rec yds", g("rec_yds"))]
    elif pos in ("WR", "TE"):
        rows = [("Catches", g("rec")), ("Rec yds", g("rec_yds")), ("Rec TD", g("rec_td")),
                ("Yds/catch", ratio(g("rec_yds"), g("rec"))), ("Rush yds", g("rush_yds"))]
    elif pos in ("EDGE", "IDL"):
        rows = [("Sacks", g("sacks")), ("TFL", g("tfl")), ("Tackles", g("tackles")), ("INT", g("def_int")), ("PBU", g("pass_breakups"))]
    elif pos == "LB":
        rows = [("Tackles", g("tackles")), ("TFL", g("tfl")), ("Sacks", g("sacks")), ("INT", g("def_int")), ("PBU", g("pass_breakups"))]
    else:
        rows = [("INT", g("def_int")), ("PBU", g("pass_breakups")), ("Tackles", g("tackles")), ("TFL", g("tfl")), ("Sacks", g("sacks"))]
    return [(k, v) for k, v in rows if v is not None][:6]


def stat_sentence(p):
    s = p.get("stats")
    if not s:
        return ""
    g = s.get
    season = g("season", 2025)
    games = f" in {g('games')} games" if g("games") else ""
    pos = p["position"]
    first = p["name"].split(" ")[0]
    if pos == "QB" and g("pass_yds"):
        bits = [f"threw for {num(g('pass_yds'))} yards"]
        if g("pass_td") is not None:
            bits.append(f"{g('pass_td')} touchdowns")
        if g("pass_int") is not None:
            bits.append(f"{g('pass_int')} interceptions")
        line = bits[0] + (", " + " and ".join(bits[1:]) if len(bits) > 1 else "")
    elif pos == "RB" and g("rush_yds"):
        line = f"ran for {num(g('rush_yds'))} yards" + (f" and {g('rush_td')} touchdowns" if g("rush_td") is not None else "")
    elif pos in ("WR", "TE") and g("rec"):
        line = f"caught {g('rec')} passes for {num(g('rec_yds') or 0)} yards" + (f" and {g('rec_td')} touchdowns" if g("rec_td") is not None else "")
    elif g("tackles") or g("sacks") or g("def_int"):
        bits = []
        if g("tackles"):
            bits.append(f"{g('tackles'):g} tackles")
        if g("tfl"):
            bits.append(f"{g('tfl'):g} tackles for loss")
        if g("sacks"):
            bits.append(f"{g('sacks'):g} sacks")
        if g("def_int"):
            bits.append(f"{g('def_int')} interceptions")
        if not bits:
            return ""
        line = "had " + (", ".join(bits[:-1]) + " and " + bits[-1] if len(bits) > 1 else bits[0])
    else:
        return ""
    return f" In {season}, {first} {line}{games}."


# ---------- player pages ----------

def player_page(p):
    root = "../"
    pos = p["position"]
    same = by_pos[pos]
    a = p.get("adp") or {}
    label, proj_text = projection(p)
    year = YEAR_NAME.get(p.get("year", ""), (p.get("year") or "").lower())
    size = f" He measures {feet(p['height'])} and {p['weight']} pounds." if p.get("height") and p.get("weight") else ""
    age = f" He will be {p['age']:.1f} years old on draft day ({DRAFT_DATE})." if p.get("age") else ""
    intro = (f"{p['name']} is {a_or_an(year or pos)} {year + ' ' if year else ''}{POS_NAME[pos]} from {p['college']}. "
             f"He is ranked #{p['rank']} on the 2027 NFL Draft big board and {ordinal(p['pos_rank'])} among "
             f"{len(same)} {POS_PLURAL[pos]}.{size}{age}{stat_sentence(p)}")

    facts = [("Big board", f"#{p['rank']}"), (f"{pos} rank", f"{p['pos_rank']} of {len(same)}"),
             ("Projection", label), ("Avg pick", f"{a['avg']:g}" if a.get("avg") else "Undrafted"),
             ("Height", feet(p.get("height"))), ("Weight", f"{p['weight']} lb" if p.get("weight") else "—"),
             ("Class", p.get("year") or "—"), ("Draft-day age", f"{p['age']:.1f}" if p.get("age") else "—")]
    facts_html = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in facts)

    fit = ""
    if a.get("team"):
        t = a["team"]
        need_note = f" {pos} is one of the {short(t)}' top needs." if pos in needs.get(t, []) else ""
        fit = f"""
    <section class="pg-section">
      <h2 class="home-h2">Most likely team</h2>
      <a class="pg-fit" href="{root}teams/{slug(t)}.html">
        {gm_tag(t, "happy", 76)}
        <span class="pg-fit-text">
          <b>{esc(t)}</b>
          <span>Took him in {a['teamPct']:g}% of the drafts where he was picked.{esc(need_note)}</span>
          <span class="pg-go">See the {esc(short(t))} mock draft →</span>
        </span>
      </a>
    </section>"""

    tiles = stat_tiles(p)
    s = p.get("stats") or {}
    if tiles:
        bits = [f"{s['games']} games"] if s.get("games") else []
        if s.get("note"):
            bits.append(re.sub(r"^\d{4} at ", "at ", s["note"]))
        stats = f"""
    <section class="pg-section">
      <h2 class="home-h2">{s.get('season', 2025)} stats</h2>
      {f'<p class="in-note">{esc(" · ".join(bits))}</p>' if bits else ''}
      <dl class="pc-stats pg-stats">{''.join(f'<div><dt>{esc(k)}</dt><dd>{esc(num(v))}</dd></div>' for k, v in tiles)}</dl>
    </section>"""
    elif pos in ("OT", "IOL"):
        stats = """
    <section class="pg-section">
      <h2 class="home-h2">Stats</h2>
      <p class="pg-text">Offensive linemen don't get box-score stats.</p>
    </section>"""
    else:
        stats = ""

    start = max(0, min(p["pos_rank"] - 4, len(same) - 8))
    peers = same[start:start + 8]
    peers_html = "".join(
        f'<li class="bb-row{" me" if q is p else ""}"><span class="bb-rank">{pos}{q["pos_rank"]}</span>'
        f'<span class="bb-text"><a class="bb-name" href="{q["slug"]}.html">{esc(q["name"])}</a>'
        f'<span class="bb-meta">{esc(q["college"])}</span></span><span class="bb-adp">#{q["rank"]}</span></li>'
        for q in peers)

    i = players.index(p)
    prev_p = players[i - 1] if i > 0 else None
    next_p = players[i + 1] if i + 1 < len(players) else None
    pager = '<nav class="pg-pager" aria-label="More prospects">' + \
        (f'<a href="{prev_p["slug"]}.html">← #{prev_p["rank"]} {esc(prev_p["name"])}</a>' if prev_p else "<span></span>") + \
        (f'<a href="{next_p["slug"]}.html">#{next_p["rank"]} {esc(next_p["name"])} →</a>' if next_p else "<span></span>") + "</nav>"

    body = f"""
    <p class="eyebrow">2027 NFL DRAFT PROFILE</p>
    <div class="pg-head">
      <span class="pg-rank">#{p['rank']}</span>
      <div>
        <h1 class="pg-title">{esc(p['name'])}</h1>
        <p class="pg-meta">{pos} · {esc(p['college'])}{' · ' + esc(p['year']) if p.get('year') else ''}</p>
      </div>
    </div>
    <p class="pg-text">{esc(intro)}</p>
    <dl class="pc-facts pg-facts">{facts_html}</dl>

    <section class="pg-section">
      <h2 class="home-h2">Draft projection</h2>
      <p class="pg-text"><b>{esc(label)}.</b> {esc(proj_text)}</p>
    </section>{fit}{stats}

    <section class="pg-section">
      <h2 class="home-h2">Top {esc(POS_PLURAL[pos])}</h2>
      <ol class="bb-list">{peers_html}</ol>
      <p class="pg-more"><a href="./#{pos}">All {len(same)} {esc(POS_PLURAL[pos])} on the big board →</a></p>
    </section>

    <section class="pg-cta">
      <div>
        <h2>Think you'd take him sooner?</h2>
        <p>Run your own 2027 mock draft against 31 big-headed GMs.</p>
      </div>
      <a class="pg-button" href="{root}?start=1">Start mock draft</a>
    </section>
    {signup("player")}
    {pager}"""

    proj_bit = f"projected {label.lower()}" if a.get("avg") else "projected undrafted"
    desc = (f"{p['name']} 2027 NFL Draft profile: {pos} from {p['college']}, #{p['rank']} on the big board, {proj_bit}. "
            f"Size, stats and where he goes in {SIMS} simulated mock drafts.")
    return page(f"players/{p['slug']}.html", f"{p['name']} 2027 NFL Draft Profile · {pos}, {p['college']} · Big Head GM", desc, body,
                crumbs=[("Big board", "players/"), (p["name"], f"players/{p['slug']}.html")], nav="players/",
                og_title=f"{p['name']} · 2027 NFL Draft profile")


def board_row(p, root=""):
    a = p.get("adp") or {}
    adp = f"ADP {a['avg']:g}" if a.get("avg") else "UDFA"
    return (f'<li class="bb-row" data-pos="{p["position"]}" data-find="{esc((p["name"] + " " + p["college"]).lower())}">'
            f'<span class="bb-rank">{p["rank"]}</span>'
            f'<span class="bb-text"><a class="bb-name" href="{root}{p["slug"]}.html">{esc(p["name"])}</a>'
            f'<span class="bb-meta">{p["position"]}{p["pos_rank"]} · {esc(p["college"])}</span></span>'
            f'<span class="bb-adp">{adp}</span></li>')


def players_index():
    chips = '<button class="filter active" data-pos="All" aria-pressed="true">All</button>' + "".join(
        f'<button class="filter" data-pos="{pos}" aria-pressed="false">{pos}</button>' for pos in POS_ORDER)
    body = f"""
    <p class="eyebrow">2027 NFL DRAFT</p>
    <h1 class="in-title">Big board</h1>
    <p class="in-sub">All {len(players)} prospects in the 2027 NFL Draft class, ranked. Tap a name for his profile, stats and where he goes in {SIMS} simulated drafts. ADP is his average pick in those drafts.</p>
    <label class="bb-search"><span class="sr-only">Search players or schools</span>
      <input type="search" id="bb-search" placeholder="Search a player or school" autocomplete="off"></label>
    <div class="in-chips bb-chips" id="bb-chips" aria-label="Position">{chips}</div>
    <p class="in-note" id="bb-count">{len(players)} prospects</p>
    <ol class="bb-list bb-board" id="bb-list">{''.join(board_row(p) for p in players)}</ol>
    <p class="pg-text" id="bb-none" hidden>No prospects match that search.</p>"""
    return page("players/index.html", f"2027 NFL Draft Big Board: Top {len(players)} Prospects · Big Head GM",
                f"The 2027 NFL Draft big board: all {len(players)} prospects ranked, with positions, schools and average pick from {SIMS} simulated mock drafts.",
                body, crumbs=[("Big board", "players/")], nav="players/")


# ---------- team pages ----------

def pick_row(s, root, show_team=False):
    """one pick: our logical mock's player, with the sims' most common choices at that slot underneath"""
    chosen = MOCK.get(s["pick"])
    sims_top = {n: v for n, _, v in s["top"]}
    if chosen:
        name, pos, share = chosen["name"], chosen["position"], sims_top.get(chosen["name"])
    else:
        name, pos, share = s["top"][0]
    others = " · ".join(f"{player_link(n, root)} {pct(v)}" for n, _, v in s["top"] if n != name)
    college = by_name[name]["college"] if name in by_name else ""
    lead = gm_tag(s["team"], "happy" if (share or 0) >= 40 else "focused", 40) if show_team else ""
    top = esc(short(s["team"])) if show_team else f"Round {s['round']}"
    return f"""<li class="in-pick">
        <span class="in-pick-no">{s['pick']}</span>{lead}
        <span class="in-pick-text">
          <span class="in-pick-team">{top}</span>
          <span class="in-pick-name">{player_link(name, root)}</span>
          <span class="in-pick-meta">{pos} · {esc(college)}</span>
          {f'<span class="in-pick-alt">Sims also like: {others}</span>' if others else ''}
        </span>
        {f'<span class="in-pick-pct" title="Taken here in {pct(share)} of simulated drafts">{pct(share)}</span>' if share else ''}
      </li>"""


def team_page(team):
    root = "../"
    info = gm_info.get(team, {})
    picks = [o for o in order if o["team"] == team]
    slots = slots_by_team.get(team, [])
    firsts = [o for o in picks if o["round"] == 1]
    need = needs.get(team, [])
    sh = short(team)

    if firsts:
        first_text = (f"including {'pick' if len(firsts) == 1 else 'picks'} "
                      + ", ".join(f"#{o['pick']}" for o in firsts) + " in the first round")
    else:
        first_text = "with no first-round pick" + (f"; their first pick is #{picks[0]['pick']} in round {picks[0]['round']}" if picks else "")
    need_text = ", ".join(POS_NAME[n] for n in need[:-1]) + (f" and {POS_NAME[need[-1]]}" if len(need) > 1 else POS_NAME.get(need[0], "") if need else "")
    lead = ""
    if slots:
        n, pos, share = slots[0]["top"][0]
        lead = (f" In {SIMS} simulated drafts, their most likely first pick is {n} ({pos}, {by_name[n]['college']}) "
                f"at #{slots[0]['pick']}, in {pct(share)} of drafts.")
    intro = (f"The {team} hold {len(picks)} {'pick' if len(picks) == 1 else 'picks'} in the 2027 NFL Draft, {first_text}. "
             f"Their biggest needs are {need_text}.{lead}")

    by_round = {}
    for o in picks:
        by_round.setdefault(o["round"], []).append(o)
    picks_html = "".join(
        f'<li><b>Round {r}</b><span>' + ", ".join(
            f"#{o['pick']}" + (f" <i>(from {esc(short(o['from']))})</i>" if o.get("from") else "") for o in by_round[r]) + "</span></li>"
        for r in sorted(by_round))

    favs = favorites.get(team, [])
    favs_html = "".join(
        f'<li class="bb-row"><span class="bb-rank">{by_name[n]["rank"] if n in by_name else ""}</span>'
        f'<span class="bb-text">{player_link(n, root, cls="bb-name")}'
        f'<span class="bb-meta">{pos} · {esc(by_name[n]["college"]) if n in by_name else ""}</span></span>'
        f'<span class="bb-adp">{pct(v)}</span></li>' for n, pos, v in favs[:8])

    i = team_names.index(team)
    prev_t, next_t = team_names[i - 1], team_names[(i + 1) % len(team_names)]

    body = f"""
    <p class="eyebrow">2027 NFL MOCK DRAFT</p>
    <div class="in-team-head pg-team-head">
      {gm_tag(team, "neutral", 110)}
      <div>
        <h1 class="pg-title">{esc(team)} mock draft</h1>
        <p class="pg-meta">{len(picks)} picks · Needs: {' · '.join(need)}</p>
        {f'<p class="pg-quote">“{esc(info["catchphrase"])}” <span>the {esc(sh)} GM</span></p>' if info.get("catchphrase") else ''}
      </div>
    </div>
    <p class="pg-text">{esc(intro)}</p>

    <section class="pg-cta">
      <div>
        <h2>Be the {esc(sh)} GM</h2>
        <p>Make every {esc(sh)} pick yourself, with trades and a grade at the end.</p>
      </div>
      <a class="pg-button" href="{root}?team={slug(team)}">Draft as the {esc(sh)}</a>
    </section>

    <section class="pg-section">
      <h2 class="home-h2">{esc(sh)} 7-round mock draft</h2>
      <p class="in-note">Our mock takes the best player available, leans toward the {esc(sh)}' needs, and doesn't stack up one position. The % is how often the {esc(sh)} took that player at that pick in {SIMS} simulated drafts.</p>
      <ol class="in-mock">{''.join(pick_row(s, root) for s in slots)}</ol>
    </section>

    <section class="pg-section pg-two">
      <div>
        <h2 class="home-h2">Players they draft most</h2>
        <p class="in-note">How often each player ended up with the {esc(sh)}, in any round.</p>
        <ol class="bb-list">{favs_html}</ol>
      </div>
      <div>
        <h2 class="home-h2">All {esc(sh)} picks</h2>
        <p class="in-note">The 2027 draft order as of today.</p>
        <ul class="pg-picks">{picks_html}</ul>
      </div>
    </section>

    {signup("team")}

    <nav class="pg-pager" aria-label="More teams">
      <a href="{slug(prev_t)}.html">← {esc(prev_t)}</a>
      <a href="{slug(next_t)}.html">{esc(next_t)} →</a>
    </nav>"""
    desc = (f"{team} 2027 mock draft: {len(picks)} picks, team needs and the most likely selection at every slot "
            f"from {SIMS} simulated drafts. Then run the {sh} draft yourself.")
    return page(f"teams/{slug(team)}.html", f"{team} 2027 Mock Draft: Picks, Needs and Projections · Big Head GM", desc, body,
                crumbs=[("Team mocks", "teams/"), (team, f"teams/{slug(team)}.html")], nav="teams/",
                og_title=f"{team} 2027 mock draft")


def teams_index():
    cards = ""
    for team in team_names:
        picks = [o for o in order if o["team"] == team]
        firsts = ", ".join(f"#{o['pick']}" for o in picks if o["round"] == 1) or "none"
        sh = short(team)
        city = team.rsplit(" ", 1)[0]
        cards += (f'<a class="home-team" href="{slug(team)}.html" aria-label="{esc(team)} mock draft">'
                  f'{gm_tag(team, "neutral", 60)}'
                  f'<span class="home-team-city">{esc(city)}</span>'
                  f'<span class="home-team-name{" long" if len(sh) > 9 else ""}">{esc(sh)}</span>'
                  f'<span class="home-team-picks">1st: {firsts}</span>'
                  f'<span class="home-team-go">See mock →</span></a>')
    body = f"""
    <p class="eyebrow">2027 NFL MOCK DRAFT</p>
    <h1 class="in-title">Team mock drafts</h1>
    <p class="in-sub">Find your team to see <b>its full 7-round mock draft</b>: every pick it holds, its biggest needs, and who it takes most often in {SIMS} simulated drafts. Teams are listed A to Z by city.</p>
    <div class="home-teams pg-teams">{cards}</div>

    <section class="pg-section">
      <h2 class="home-h2">Round 1, pick by pick</h2>
      <p class="in-note">Our first-round mock: best player available, team needs, no position stacked twice.</p>
      <ol class="in-mock">{''.join(pick_row(s, "../", True) for s in sims['slots'] if s['round'] == 1)}</ol>
    </section>"""
    return page("teams/index.html", "2027 NFL Mock Draft for All 32 Teams · Big Head GM",
                f"A 2027 NFL mock draft page for every team: needs, picks and the most likely selections from {SIMS} simulated drafts.",
                body, crumbs=[("Team mocks", "teams/")], nav="teams/")


# ---------- who goes #1 ----------

def odds_page():
    first = read_csv("sim_first.csv")
    market = read_csv("market_odds.csv")
    books = {}
    for r in market:
        books.setdefault(r["book"], []).append(r)
    team = first[0]["team"] if first else order[0]["team"]
    ours = {r["name"]: float(r["pct"]) for r in first}
    fd = {r["name"]: r["odds"] for r in books.get("FanDuel", [])}
    ka = {r["name"]: float(r["prob"]) for r in books.get("Kalshi", [])}

    names = sorted(set(ours) | set(fd) | set(ka),
                   key=lambda n: -max(ours.get(n, 0), implied(fd[n]) if n in fd else 0, ka.get(n, 0)))
    rows = ""
    for n in names:
        p = by_name.get(n, {})
        o = ours.get(n)
        rows += f"""<tr>
          <th scope="row">{player_link(n, "")}<span>{esc(p.get('position', ''))} · {esc(p.get('college', ''))}</span></th>
          <td><b>{pct(o) if o else '0%'}</b><span>{american(o) if o else 'never'}</span></td>
          <td>{esc(fd.get(n, '—'))}<span>{pct(implied(fd[n])) if n in fd else ''}</span></td>
          <td>{pct(ka[n]) if n in ka else '—'}</td>
        </tr>"""

    def source(book):
        rs = books.get(book)
        if not rs:
            return ""
        return f'{book} as of {nice_date(rs[0]["as_of"])}, reported by <a href="{esc(rs[0]["url"])}" rel="noopener nofollow">{esc(rs[0]["reported_by"])}</a>'
    sources = " · ".join(x for x in (source("FanDuel"), source("Kalshi")) if x)

    our_top = max(ours, key=ours.get) if ours else ""
    fd_top = min(fd, key=lambda n: -implied(fd[n])) if fd else ""
    ka_top = max(ka, key=ka.get) if ka else ""
    qb_note = ""
    market_qbs = [n for n in list(fd) + list(ka) if by_name.get(n, {}).get("position") == "QB"]
    if market_qbs and not any(by_name.get(n, {}).get("position") == "QB" for n in ours):
        qb_note = (f" Our simulations always have the {short(team)} making the pick, and quarterback isn't one of their top needs, "
                   f"so no quarterback goes first in any of our {SIMS} drafts. The betting markets are pricing in something our "
                   f"simulations don't: the draft order isn't final, and a team that needs a quarterback could end up with the pick or trade up for it.")
    summary = f"In our simulations, {our_top} goes first most often ({pct(ours[our_top])})." if our_top else ""
    if fd_top:
        summary += f" FanDuel's favorite is {fd_top} ({fd[fd_top]})."
    if ka_top:
        summary += f" On Kalshi, the favorite is {ka_top} ({pct(ka[ka_top])})."

    body = f"""
    <p class="eyebrow">2027 NFL DRAFT ODDS</p>
    <h1 class="in-title">Who goes #1?</h1>
    <p class="in-sub">Odds to be the first pick in the 2027 NFL Draft: what {SIMS} Big Head GM simulated drafts say, next to the latest sportsbook and prediction-market prices.</p>

    <a class="pg-fit od-clock" href="teams/{slug(team)}.html">
      {gm_tag(team, "focused", 76)}
      <span class="pg-fit-text">
        <span class="od-label">ON THE CLOCK AT #1</span>
        <b>{esc(team)}</b>
        <span>Needs: {' · '.join(needs.get(team, []))}</span>
      </span>
    </a>

    <div class="od-wrap">
      <table class="od-table">
        <thead><tr>
          <th scope="col">Player</th>
          <th scope="col">Our sims</th>
          <th scope="col">FanDuel</th>
          <th scope="col">Kalshi</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <p class="in-note">“Our sims” is how often each player went first in {SIMS} simulated drafts, with that chance as American odds underneath. Under each FanDuel price is the chance it implies. Kalshi is a prediction market, so its prices are already chances. {sources}.</p>

    <section class="pg-section">
      <h2 class="home-h2">What the numbers say</h2>
      <p class="pg-text">{esc(summary)}{esc(qb_note)}</p>
    </section>

    <section class="pg-cta">
      <div>
        <h2>Make the pick yourself</h2>
        <p>Take over the {esc(short(team))} and decide who goes #1.</p>
      </div>
      <a class="pg-button" href="./?team={slug(team)}">Draft as the {esc(short(team))}</a>
    </section>

    {signup("odds")}

    <p class="od-fine">Big Head GM is not a sportsbook and does not take bets. Odds are shown for information only, change often, and may differ by sportsbook and state. Sports betting is for adults 21 and over where legal. If you or someone you know has a gambling problem, call 1-800-GAMBLER.</p>"""
    return page("odds.html", "2027 NFL Draft #1 Pick Odds: Who Goes First Overall? · Big Head GM",
                f"Odds to be the #1 pick in the 2027 NFL Draft: {SIMS} simulated drafts compared with FanDuel and Kalshi. {summary}".strip(),
                body, crumbs=[("#1 pick odds", "odds.html")], nav="odds.html")


FF_CTA = ('<a class="ff-cta" href="fantasy-draft.html">'
          '<span class="ff-cta-text"><span class="ff-cta-tag">NEW</span><b class="ff-cta-title">Fantasy mock draft</b>'
          '<span class="ff-cta-sub">Set up your league and draft against the computer. Free, no sign-up.</span></span>'
          '<span class="ff-cta-chips" aria-hidden="true"><i>4 to 16 teams</i><i>PPR</i><i>Superflex</i><i>Dynasty</i><i>Rookie drafts</i></span>'
          '<span class="ff-cta-go">Draft now →</span></a>')
FF_TRADE_CTA = ('<a class="ff-cta" href="fantasy-trade.html">'
                '<span class="ff-cta-text"><span class="ff-cta-tag">NEW</span><b class="ff-cta-title">Trade analyzer</b>'
                '<span class="ff-cta-sub">Who wins your trade? Redraft or dynasty, any scoring.</span></span>'
                '<span class="ff-cta-go">Check a trade →</span></a>')
FF_ROS_CTA = ('<a class="ff-cta" href="fantasy-ros.html">'
              '<span class="ff-cta-text"><span class="ff-cta-tag">NEW</span><b class="ff-cta-title">Rest-of-season rankings</b>'
              '<span class="ff-cta-sub">Every player through Week 17, with matchups and playoff schedules.</span></span>'
              '<span class="ff-cta-go">See rankings →</span></a>')
FF_SS_CTA = ('<a class="ff-cta" href="fantasy-start-sit.html">'
             '<span class="ff-cta-text"><span class="ff-cta-tag">NEW</span><b class="ff-cta-title">Start or sit?</b>'
             '<span class="ff-cta-sub">Stuck between two players? Get a call for this week.</span></span>'
             '<span class="ff-cta-go">Who do I start? →</span></a>')
FF_CTAS = '<div class="ff-ctas">' + FF_SS_CTA + FF_TRADE_CTA + FF_ROS_CTA + FF_CTA + '</div>'


# ---------- fantasy ----------

FF_TEAM = {"ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
           "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
           "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LV": "Raiders", "LAC": "Chargers",
           "LAR": "Rams", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
           "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SF": "49ers", "SEA": "Seahawks", "TB": "Buccaneers",
           "TEN": "Titans", "WAS": "Commanders"}


def ff_leader_rows(rows, fmt, pos="All", n=50):
    rows = sorted([r for r in rows if pos == "All" or r["p"] == pos], key=lambda r: -r["s"][fmt])[:n]
    return "".join(
        f'<tr><td class="ff-rk">{i}</td><th scope="row"><a href="fantasy/{slug(r["n"])}.html">{esc(r["n"])}</a><span>{r["p"]} · {esc(FF_TEAM.get(r["t"], r["t"]))} · {esc(r["line"])}</span></th>'
        f'<td>{r["g"]}</td><td><b>{r["s"][fmt]:.1f}</b></td><td>{r["s"][fmt] / r["g"]:.1f}</td></tr>'
        for i, r in enumerate(rows, 1))


def ff_rookie_rows(rows, key, fmt, n=25):
    rows = sorted(rows, key=lambda r: -r[key][fmt])[:n]
    out = ""
    for i, r in enumerate(rows, 1):
        p = by_name.get(r["n"])
        name = f'<a href="players/{p["slug"]}.html">{esc(r["n"])}</a>' if p else esc(r["n"])
        age = f' · age {r["age"]:g}' if r["age"] else ""
        why = f' · {esc(r["why"])}' if r["why"] else ""
        out += (f'<li class="ff-rook"><span class="bb-rank">{i}</span>{gm_tag(r["team"], "happy", 40)}'
                f'<span class="bb-text"><b class="ff-rname">{name}</b>'
                f'<span class="bb-meta">{r["p"]} · {esc(r["c"])}{age}{why}</span>'
                f'<span class="bb-meta">Projected pick #{r["pick"]:g} · most often to the {esc(short(r["team"]))} ({r["tp"]:g}%)</span></span></li>')
    return out


def trending_intro(trend):
    if not trend["ready"]:
        return ('<div class="tr-soon"><b>Trending is updating.</b> Check back after Tuesday\'s stats update.</div>')
    span = f'Week {trend["to"]}' if trend["from"] == trend["to"] else f'Weeks {trend["from"]}–{trend["to"]}'
    return (f'<p class="in-note">Fantasy points per game in {span} compared with Weeks 1–{trend["from"] - 1}, in your scoring, '
            f'plus carries and targets (how much the offense uses him). Only games he played count, so byes and injuries '
            f'don\'t drag anyone down. Game-by-game stats from <a href="https://github.com/nflverse" rel="noopener nofollow">nflverse</a>.</p>')


def fantasy_page():
    lead = fantasy.leaders()
    rook = fantasy.rookies()
    trend = fantasy.trends()
    if trend["ready"]:
        for r in trend["players"]:
            r["slug"] = slug(r["n"])
    data = json.dumps({"trends": trend, "leaders": [dict(r, slug=slug(r["n"])) for r in lead], "rookies": [
        dict(r, slug=by_name[r["n"]]["slug"] if r["n"] in by_name else "", short=short(r["team"])) for r in rook]},
        separators=(",", ":")).replace("</", "<\\/")
    fmt_btns = "".join(f'<button class="filter{" active" if k == "ppr" else ""}" data-fmt="{k}" aria-pressed="{"true" if k == "ppr" else "false"}">{label}</button>'
                       for k, label in fantasy.FORMATS)
    pos_btns = "".join(f'<button class="filter{" active" if p == "All" else ""}" data-pos="{p}" aria-pressed="{"true" if p == "All" else "false"}">{p}</button>'
                       for p in ("All", "QB", "RB", "WR", "TE"))
    top = {k: max(lead, key=lambda r: r["s"][k]) for k, _ in fantasy.FORMATS}
    r1 = max(rook, key=lambda r: r["dyn"]["ppr"])
    body = f"""
    <p class="eyebrow">FANTASY FOOTBALL</p>
    <h1 class="in-title">Fantasy leaders and 2027 rookie rankings</h1>
    <p class="in-sub">Who's scoring the most fantasy points in 2026, and which 2027 rookies to target, for next season and for dynasty. Pick your league's scoring and everything on the page updates.</p>
    {FF_CTAS}

    <div class="ff-tabs" id="ff-tabs" role="tablist" aria-label="Show">
      <a href="#leaders" role="tab" data-tab="leaders" class="active" aria-selected="true">2026 leaders</a><a href="#trending" role="tab" data-tab="trending" aria-selected="false">Trending</a><a href="#next-year" role="tab" data-tab="next-year" aria-selected="false">Rookies for next season</a><a href="#dynasty" role="tab" data-tab="dynasty" aria-selected="false">Dynasty rookies</a>
    </div>

    <div class="ff-bar">
      <p class="ff-label">Your scoring</p>
      <div class="in-chips ff-fmt" id="ff-fmt" aria-label="Scoring">{fmt_btns}</div>
    </div>

    <section class="pg-section ff-panel" id="leaders" role="tabpanel">
      <h2 class="home-h2">Who's leading in 2026</h2>
      <p class="in-note">Season totals {fantasy.STATS_AS_OF}. Tap a position to see just that group.</p>
      <label class="bb-search"><span class="sr-only">Search a player</span>
        <input type="search" id="ff-search" placeholder="Search {len(lead)} players" autocomplete="off"></label>
      <div class="ff-filters">
        <div class="in-chips bb-chips" id="ff-pos" aria-label="Position">{pos_btns}</div>
        <label class="ff-team"><span class="sr-only">Team</span>
          <select id="ff-team"><option value="">All teams</option>{"".join(f'<option value="{a}">{esc(n)}</option>' for a, n in sorted(FF_TEAM.items(), key=lambda x: x[1]))}</select></label>
      </div>
      <div class="od-wrap">
        <table class="od-table ff-table">
          <thead><tr><th scope="col" class="ff-rk">#</th><th scope="col">Player</th><th scope="col">GP</th><th scope="col">Pts</th><th scope="col">PPG</th></tr></thead>
          <tbody id="ff-lead">{ff_leader_rows(lead, "ppr")}</tbody>
        </table>
      </div>
      <button class="secondary gm-wide ff-more" id="ff-more">Show all players</button>
    </section>

    <section class="pg-section ff-panel" id="trending" role="tabpanel">
      <h2 class="home-h2">Who's trending</h2>
      {trending_intro(trend)}
      <div class="in-chips bb-chips" id="tr-pos" aria-label="Position">{pos_btns.replace('data-pos=', 'data-tpos=')}</div>
      <div class="tr-cols">
        <div><h3 class="tr-h up">Heating up</h3><ol class="tr-list" id="tr-up"></ol></div>
        <div><h3 class="tr-h down">Cooling off</h3><ol class="tr-list" id="tr-down"></ol></div>
      </div>
    </section>

    <section class="pg-section ff-panel" id="next-year" role="tabpanel">
      <h2 class="home-h2">Best 2027 rookies for next season</h2>
      <p class="in-note">Who should help a fantasy team the most as a rookie in 2027. Backs and receivers drafted early get the biggest boost; rookie quarterbacks and tight ends usually take time.</p>
      <ol class="bb-list ff-list" id="ff-y1">{ff_rookie_rows(rook, "y1", "ppr")}</ol>
    </section>

    <section class="pg-section ff-panel" id="dynasty" role="tabpanel">
      <h2 class="home-h2">2027 dynasty rookie rankings</h2>
      <p class="in-note">For leagues where you keep players for years. Youth and position matter more here: a 20-year-old receiver can be a starter for a decade. Rankings are for 1-QB leagues.</p>
      <ol class="bb-list ff-list" id="ff-dyn">{ff_rookie_rows(rook, "dyn", "ppr")}</ol>
    </section>

    <section class="pg-section">
      <h2 class="home-h2">How the scoring works</h2>
      <p class="pg-text"><b>Standard:</b> 1 point per 10 rushing or receiving yards, 6 per rushing or receiving touchdown, 1 per 25 passing yards, 4 per passing touchdown, minus 2 per interception. <b>Half PPR</b> adds half a point per catch. <b>PPR</b> adds a full point per catch. <b>TE Premium</b> is PPR plus an extra half point for every tight end catch. Fumbles and two-point conversions aren't counted.</p>
      <p class="pg-text"><b>Rookie rankings</b> are our own model, not anyone's consensus. They mix where each player goes in our {SIMS} simulated drafts (the biggest part), his age on draft day and his college production. Most-likely team comes from those same simulations and will change as the draft order does.</p>
    </section>

    <section class="pg-cta">
      <div>
        <h2>Put him on your team</h2>
        <p>Run a mock and draft the rookies you want.</p>
      </div>
      <a class="pg-button" href="./?start=1">Start a mock draft</a>
    </section>

    {signup("fantasy")}

    <p class="od-fine">2026 stats: <a href="https://www.fftoday.com/stats/playerstats.php" rel="noopener nofollow">FFToday</a>, {fantasy.STATS_AS_OF}. Players traded at the deadline are listed with their new team. Updated every Tuesday.</p>
    <script type="application/json" id="ff-data">{data}</script>"""
    desc = (f"2026 fantasy football leaders in Standard, Half PPR, PPR and TE Premium scoring, plus 2027 rookie rankings for next season and dynasty. "
            f"PPR leader: {top['ppr']['n']}. Top dynasty rookie: {r1['n']}.")
    return page("fantasy.html", "Fantasy Football Leaders 2026 and 2027 Dynasty Rookie Rankings · Big Head GM", desc,
                body, crumbs=[("Fantasy", "fantasy.html")], nav="fantasy.html", scripts=("fantasy.js?v=10",))


# ---------- games ----------

def games_pages():
    hub = f"""
    <p class="eyebrow">BIG HEAD GM GAMES</p>
    <h1 class="in-title">Games</h1>
    <p class="in-sub">Quick games for when you're not on the clock. Free, no sign-up, and they work on your phone.</p>
    <h2 class="home-h2 gh-h2">Daily games <span class="gh-badge">NEW</span></h2>
    <p class="in-note">A new mystery player every day at midnight Eastern. Share your score and see if your friends can beat it.</p>
    <div class="gh-grid gh-daily">
      <a class="gh-card" href="prospectle.html">
        <span class="gh-art gh-pl" aria-hidden="true"><i class="g">SEC</i><i class="y">WR</i><i>6-2</i><i class="g">#7</i></span>
        <span class="gh-text"><b>Prospectle</b>
          <span>Guess the mystery 2027 prospect in 8 tries. Green is a match, yellow is close. New player every day, or play unlimited.</span>
          <span class="pg-go">Play →</span></span>
      </a>
      <a class="gh-card" href="fantasle.html">
        <span class="gh-art gh-pl" aria-hidden="true"><i class="g">WR</i><i class="y">25.7</i><i>NFC W</i><i class="g">9</i></span>
        <span class="gh-text"><b>Fantasle</b>
          <span>Guess the mystery NFL fantasy player in 8 tries from his team, position and PPR points per game. New player every day, or play unlimited.</span>
          <span class="pg-go">Play →</span></span>
      </a>
      <a class="gh-card" href="17-0.html">
        <span class="gh-art gh-p17" aria-hidden="true"><b>17-0</b><span>🟩🟩🟩🟩🟩🟩🟩🟩🟩</span></span>
        <span class="gh-text"><b>17-0</b>
          <span>Draft a PPR lineup one random team at a time, then play a 17-week season. Can you go undefeated? New teams every day.</span>
          <span class="pg-go">Play →</span></span>
      </a>
    </div>
    <h2 class="home-h2 gh-h2">More games</h2>
    <div class="gh-grid">
      <a class="gh-card" href="blitz.html">
        <span class="gh-art gh-blitz" aria-hidden="true"><span>DRAFT</span><span>PASS</span></span>
        <span class="gh-text"><b>Draft Day Blitz</b>
          <span>20 prospects, 7 picks, 4 seconds each. Swipe to draft or pass, then see how your class grades out. New daily challenge every day.</span>
          <span class="pg-go">Play →</span></span>
      </a>
      <a class="gh-card" href="juke.html">
        <span class="gh-art gh-juke" aria-hidden="true">{gm_tag("Chicago Bears", "trade", 60, "gh-gm")}{gm_tag("New York Jets", "trade", 60, "gh-gm")}{gm_tag("Dallas Cowboys", "trade", 60, "gh-gm")}</span>
        <span class="gh-text"><b>Juke</b>
          <span>Run the ball through 32 angry big-headed GMs. Swipe to dodge, grab footballs, and see how many yards you can get.</span>
          <span class="pg-go">Play →</span></span>
      </a>
    </div>
    {signup("games")}"""
    write("games/index.html", page("games/index.html", "Free Football Games: Prospectle, Fantasle, 17-0, Draft Day Blitz and Juke · Big Head GM",
          "Free football games from Big Head GM: Prospectle, a daily guess-the-prospect game, Draft Day Blitz, a daily swipe-to-draft challenge, and Juke, an endless runner through 32 big-headed GMs.",
          hub, crumbs=[("Games", "games/")], nav="games/"))

    blitz = """
    <div class="gm-shell" id="blitz">
      <div class="gm-top">
        <div><p class="eyebrow" id="bz-eyebrow">DRAFT DAY BLITZ</p><h1 class="gm-title">Draft Day Blitz</h1></div>
        <a class="gm-exit" href="./">All games</a>
      </div>

      <section id="bz-intro" class="gm-panel">
        <p class="pg-text">20 prospects flash by. You have <b>7 picks</b> and <b>4 seconds</b> on each one. Their rankings are hidden, so you have to know your prospects.</p>
        <ul class="gm-rules">
          <li><b>Swipe right</b> (or tap Draft) to take him.</li>
          <li><b>Swipe left</b> (or tap Pass) to let him go. No going back.</li>
          <li>Players at your <b>team needs</b> are worth 25% more.</li>
        </ul>
        <button class="start" id="bz-daily">Play today's challenge</button>
        <button class="secondary gm-wide" id="bz-free">Free play (random cards)</button>
        <p class="in-note" id="bz-record"></p>
      </section>

      <section id="bz-play" class="gm-panel" hidden>
        <div class="bz-hud">
          <span id="bz-left">Card 1 of 20</span>
          <span id="bz-needs"></span>
          <span id="bz-picks">7 picks left</span>
        </div>
        <div class="bz-timer" aria-hidden="true"><span id="bz-time"></span></div>
        <div class="bz-stage">
          <div class="bz-card" id="bz-card" tabindex="0" aria-live="polite"></div>
        </div>
        <div class="bz-buttons">
          <button class="secondary" id="bz-pass">← Pass</button>
          <button class="start" id="bz-draft">Draft →</button>
        </div>
        <ol class="bz-roster" id="bz-roster" aria-label="Your class so far"></ol>
      </section>

      <section id="bz-done" class="gm-panel" hidden>
        <div class="bz-grade"><span id="bz-letter">A</span><div><b id="bz-score"></b><span id="bz-detail"></span></div></div>
        <p class="bz-squares" id="bz-squares" aria-hidden="true"></p>
        <div class="bz-buttons">
          <button class="secondary" id="bz-share">Share result</button>
          <button class="start" id="bz-again">Play again</button>
        </div>
        <p class="in-note" id="bz-share-note" role="status"></p>
        <h2 class="home-h2">Your class</h2>
        <ol class="bb-list" id="bz-class"></ol>
        <h2 class="home-h2">Who you passed on</h2>
        <ol class="bb-list" id="bz-missed"></ol>
        <p class="pg-more"><a href="../?start=1">Now run a full mock draft →</a></p>
        <section class="nl" data-from="blitz" hidden>
      <h2>Get the weekly mock</h2>
      <p>One email a week: the new top 10, the biggest risers and fallers, and the #1 pick odds. Free, no spam, unsubscribe anytime.</p>
      <form class="nl-form" method="post">
        <label class="sr-only" for="nl-email-blitz">Email address</label>
        <input id="nl-email-blitz" type="email" name="email_address" placeholder="you@email.com" autocomplete="email" required>
        <button class="pg-button" type="submit">Sign up</button>
      </form>
      <p class="nl-note" role="status"></p>
    </section>
      </section>
    </div>"""
    write("games/blitz.html", page("games/blitz.html", "Draft Day Blitz: A Daily NFL Draft Game · Big Head GM",
          "Draft Day Blitz: 20 prospects, 7 picks, 4 seconds each. Swipe to draft or pass with rankings hidden, then get your grade. A new 2027 NFL Draft challenge every day.",
          blitz, nav="games/", scripts=("games/blitz.js?v=1",), body_class="info-page game-page"))

    juke = """
    <div class="gm-shell" id="juke">
      <div class="gm-top">
        <div><p class="eyebrow">BIG HEAD GM GAMES</p><h1 class="gm-title">Juke</h1></div>
        <a class="gm-exit" href="./">All games</a>
      </div>
      <div class="jk-frame">
        <canvas id="jk-canvas" width="360" height="560" aria-label="Juke: dodge the big-headed GMs"></canvas>
        <div class="jk-overlay" id="jk-start">
          <h2>Run through 32 angry GMs</h2>
          <p><b>Swipe</b> or tap the left and right side to change lanes. On a keyboard, use the arrow keys.</p>
          <p>Grab footballs for bonus yards. It gets faster every touchdown.</p>
          <button class="start" id="jk-go">Start running</button>
          <p class="in-note" id="jk-best"></p>
        </div>
        <div class="jk-overlay" id="jk-over" hidden>
          <span class="jk-tackler" id="jk-tackler"></span>
          <h2 id="jk-over-title">Tackled!</h2>
          <p id="jk-over-text"></p>
          <div class="bz-buttons">
            <button class="secondary" id="jk-share">Share</button>
            <button class="start" id="jk-retry">Run it back</button>
          </div>
          <p class="in-note" id="jk-share-note" role="status"></p>
        </div>
      </div>
      <p class="in-note jk-help">Swipe or tap left/right · arrow keys on a computer · P to pause</p>
    </div>"""
    write("games/juke.html", page("games/juke.html", "Juke: Dodge 32 Big-Headed GMs · Big Head GM",
          "Juke is a free endless-runner football game. Swipe to dodge 32 big-headed GMs, grab footballs and see how many yards you can run.",
          juke, nav="games/", scripts=("games/juke.js?v=1",), body_class="info-page game-page"))


# ---------- Prospectle (the daily guess-the-prospect game) ----------

CONF = {}
for conf, schools in {
    "SEC": "Alabama|Arkansas|Auburn|Florida|Georgia|Kentucky|LSU|Mississippi State|Missouri|Oklahoma|Ole Miss|South Carolina|Tennessee|Texas|Texas A&M|Vanderbilt",
    "Big Ten": "Illinois|Indiana|Iowa|Maryland|Michigan|Michigan State|Minnesota|Nebraska|Northwestern|Ohio State|Oregon|Penn State|Rutgers|UCLA|USC|Washington|Wisconsin",
    "ACC": "California|Clemson|Duke|Florida State|Georgia Tech|Louisville|Miami (FL)|NC State|North Carolina|Pittsburgh|SMU|Stanford|Syracuse|Virginia|Virginia Tech|Wake Forest",
    "Big 12": "Arizona State|BYU|Baylor|Cincinnati|Colorado|Houston|Kansas State|Oklahoma State|TCU|Texas Tech|UCF|Utah|West Virginia",
    "Independent": "Notre Dame",
    "Pac-12": "Boise State|Fresno State",
    "Mountain West": "Nevada|UNLV",
    "American": "Army|Florida Atlantic|Memphis|Temple|Tulsa|UTSA",
    "C-USA": "Liberty",
    "FCS": "Austin Peay|North Dakota State|Youngstown State|Yale",
}.items():
    for school in schools.split("|"):
        CONF[school] = conf
PROSPECTLE_POOL = 75         # the daily answer is always one of the top 75 on the board


def prospectle_page():
    rows = []
    for p in players:
        a = p.get("adp") or {}
        ft, inch = (p["height"].split("-") + ["0"])[:2] if p.get("height") else ("0", "0")
        rows.append([p["name"], p["slug"], p["position"], p["college"], CONF.get(p["college"], "Other"),
                     int(ft) * 12 + int(inch), int(p.get("weight") or 0), p["year"],
                     round(a["avg"]) if a.get("avg") and a.get("pct", 0) >= 50 else 0,
                     a.get("team", ""), 1 if p["rank"] <= PROSPECTLE_POOL else 0, p["rank"]])
    missing = sorted({p["college"] for p in players if p["college"] not in CONF})
    assert not missing, f"add these schools to CONF: {missing}"
    data = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    body = f"""
    <div class="gm-shell pl-shell" id="prospectle">
      <div class="gm-top">
        <div><p class="eyebrow" id="pl-eyebrow">DAILY</p><h1 class="gm-title">Prospectle</h1></div>
        <a class="gm-exit" href="./">All games</a>
      </div>
      <div class="in-chips pl-modes" id="pl-modes">
        <button class="filter active" data-mode="daily" aria-pressed="true">Daily</button>
        <button class="filter" data-mode="unlimited" aria-pressed="false">Unlimited</button>
        <button class="filter" data-mode="help" aria-pressed="false">How to play</button>
        <button class="filter" data-mode="stats" aria-pressed="false">Stats</button>
      </div>

      <section class="gm-panel" id="pl-help" hidden>
        <p class="pg-text">Guess the mystery <b>2027 NFL Draft prospect</b> in <b>8 tries</b>. After each guess, every box tells you how close you are.</p>
        <ul class="gm-rules">
          <li><span class="pl-key g"></span> <b>Green</b>: exact match.</li>
          <li><span class="pl-key y"></span> <b>Yellow</b>: close. Same position group, height within 2 inches, weight within 10 lbs, class one year off, big board rank within 10.</li>
          <li>Arrows and words tell you about the <b>mystery player</b> compared with your guess: <b>↑ Taller / ↓ Shorter</b>, <b>↑ Heavier / ↓ Lighter</b>, <b>↑ Older / ↓ Younger</b> (class), and <b>↑ Better / ↓ Worse</b> for big board rank (better means closer to #1).</li>
          <li><b>Rank</b> is his spot on the 2027 big board (#1 is the top prospect). <b>↑</b> means the mystery player is ranked lower (a bigger number).</li>
        </ul>
        <p class="pg-text">The daily player is the same for everyone and changes at midnight Eastern. Unlimited gives you a new player every round.</p>
        <button class="start gm-wide" id="pl-help-close">Play</button>
      </section>

      <section class="gm-panel" id="pl-stats" hidden>
        <div class="pl-statrow" id="pl-statrow"></div>
        <h2 class="home-h2">Guesses (daily)</h2>
        <div class="pl-dist" id="pl-dist"></div>
        <button class="start gm-wide" id="pl-stats-close">Back to the game</button>
      </section>

      <section class="gm-panel" id="pl-game">
        <p class="in-note pl-count" id="pl-count">Guess 1 of 8</p>
        <div class="pl-head" aria-hidden="true"><span>School</span><span>Conf</span><span>Pos</span><span>Ht</span><span>Wt</span><span>Class</span><span>Rank</span></div>
        <ol class="pl-board" id="pl-board" aria-live="polite"></ol>
        <div class="pl-search">
          <label class="sr-only" for="pl-input">Guess a 2027 prospect</label>
          <input id="pl-input" type="search" placeholder="Type a prospect's name" autocomplete="off" autocapitalize="words" spellcheck="false">
          <ul class="pl-suggest" id="pl-suggest" role="listbox" hidden></ul>
        </div>
        <div class="pl-done" id="pl-done" hidden>
          <div class="pl-reveal">
            <span class="pl-gm" id="pl-gm"></span>
            <div><p class="pl-result" id="pl-result"></p><a class="pl-name" id="pl-answer" href="#"></a><span class="pl-meta" id="pl-meta"></span></div>
          </div>
          <p class="bz-squares pl-squares" id="pl-squares" aria-hidden="true"></p>
          <div class="bz-buttons">
            <button class="secondary" id="pl-share">Share</button>
            <button class="start" id="pl-next">Play unlimited</button>
          </div>
          <p class="in-note" id="pl-share-note" role="status"></p>
          <p class="in-note" id="pl-countdown"></p>
        </div>
        <button class="pl-giveup" id="pl-giveup">Give up</button>
      </section>
      {signup("prospectle")}
    </div>
    <script type="application/json" id="pl-data">{data}</script>"""
    write("games/prospectle.html", page("games/prospectle.html", "Prospectle: Guess the 2027 NFL Draft Prospect · Big Head GM",
          "Prospectle is a free daily NFL draft guessing game. Guess the mystery 2027 prospect in 8 tries using his school, conference, position, size, class and projected pick. Play daily or unlimited.",
          body, nav="games/", scripts=("games/prospectle.js?v=6",), body_class="info-page game-page", og_title="Prospectle: guess today's mystery 2027 NFL Draft prospect"))


# ---------- NFL fantasy player profiles (docs/fantasy/<player>.html) ----------

FF_POS_NAME = {"QB": "quarterback", "RB": "running back", "WR": "wide receiver", "TE": "tight end"}
FF_POS_PLURAL = {"QB": "quarterbacks", "RB": "running backs", "WR": "wide receivers", "TE": "tight ends"}


def nfl_profiles():
    lead = fantasy.leaders()
    raw = {r["name"]: r for r in fantasy.read("fantasy_stats.csv")}
    full = {FF_TEAM[a]: next(t for t in team_names if t.endswith(FF_TEAM[a])) for a in FF_TEAM}
    fmts = [k for k, _ in fantasy.FORMATS]
    rank, prank = {}, {}
    for k in fmts:
        for i, r in enumerate(sorted(lead, key=lambda r: -r["s"][k]), 1):
            rank[(r["n"], k)] = i
        for pos in FF_POS_NAME:
            for i, r in enumerate(sorted([x for x in lead if x["p"] == pos], key=lambda r: -r["s"][k]), 1):
                prank[(r["n"], k)] = i
    count = {pos: sum(1 for r in lead if r["p"] == pos) for pos in FF_POS_NAME}
    paths = []
    for r in lead:
        n, pos, g = r["n"], r["p"], r["g"]
        st = raw[n]
        f = fantasy.f
        team = full.get(FF_TEAM.get(r["t"], ""), r["t"])
        sl = slug(n)
        ppr, ppg = r["s"]["ppr"], r["s"]["ppr"] / g
        intro = (f"{n} is a {FF_POS_NAME[pos]} for the {team}. {fantasy.STATS_AS_OF[0].upper() + fantasy.STATS_AS_OF[1:]}, "
                 f"he has {ppr:.1f} PPR fantasy points in {g} game{'s' if g != 1 else ''}, an average of {ppg:.1f} points per game (PPG). That ranks "
                 f"{ordinal(prank[(n, 'ppr')])} among {count[pos]} {FF_POS_PLURAL[pos]} and {ordinal(rank[(n, 'ppr')])} among all "
                 f"{len(lead)} players in PPR scoring.")
        if r["line"]:
            intro += f" His season so far: {r['line']}."

        fmt_rows = "".join(
            f'<tr><th scope="row">{label}</th><td><b>{r["s"][k]:.1f}</b></td><td>{r["s"][k] / g:.1f}</td>'
            f'<td>{pos}{prank[(n, k)]}</td><td>#{rank[(n, k)]}</td></tr>'
            for k, label in fantasy.FORMATS if k != "tep" or pos == "TE")

        tiles = [("Games", g)]
        if pos == "QB":
            tiles += [("Pass yds", f(st["pass_yds"])), ("Pass TD", f(st["pass_td"])), ("INT", f(st["int"])),
                      ("Rush yds", f(st["rush_yds"])), ("Rush TD", f(st["rush_td"]))]
        elif pos == "RB":
            tiles += [("Rush yds", f(st["rush_yds"])), ("Rush TD", f(st["rush_td"])), ("Catches", f(st["rec"])),
                      ("Rec yds", f(st["rec_yds"])), ("Rec TD", f(st["rec_td"]))]
        else:
            tiles += [("Catches", f(st["rec"])), ("Rec yds", f(st["rec_yds"])), ("Rec TD", f(st["rec_td"])),
                      ("Per catch", round(f(st["rec_yds"]) / f(st["rec"]), 1) if f(st["rec"]) else "—")]
            if f(st["rush_yds"]) or f(st["rush_td"]):
                tiles += [("Rush yds", f(st["rush_yds"])), ("Rush TD", f(st["rush_td"]))]
        show = lambda v: v if isinstance(v, str) else (f"{int(v):,}" if float(v).is_integer() else f"{v:g}")
        tiles_html = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(show(v))}</dd></div>" for k, v in tiles)

        def mini(rows, me=None):
            return "".join(
                f'<li class="bb-row{" me" if q["n"] == me else ""}"><span class="bb-rank">{q["p"]}{prank[(q["n"], "ppr")]}</span>'
                f'<span class="bb-text"><a class="bb-name" href="{slug(q["n"])}.html">{esc(q["n"])}</a>'
                f'<span class="bb-meta">{esc(FF_TEAM.get(q["t"], q["t"]))} · {q["s"]["ppr"]:.1f} pts · {q["g"]} GP</span></span>'
                f'<span class="ff-ppg"><b>{q["s"]["ppr"] / q["g"]:.1f}</b><span>PPR PPG</span></span></li>' for q in rows)
        order = list(FF_POS_NAME)
        mates = sorted([q for q in lead if q["t"] == r["t"]], key=lambda q: (order.index(q["p"]), -q["s"]["ppr"]))
        mates_html = ""
        for ps in order:
            grp = [q for q in mates if q["p"] == ps]
            if grp:
                mates_html += f'<h3 class="ff-grp">{FF_POS_PLURAL[ps].capitalize()}</h3><ol class="bb-list">{mini(grp, n)}</ol>'
        same = sorted([q for q in lead if q["p"] == pos], key=lambda q: -q["s"]["ppr"])
        i = prank[(n, "ppr")] - 1
        start = max(0, min(i - 3, len(same) - 7))
        peers = same[start:start + 7]

        body = f"""
    <p class="eyebrow">2026 FANTASY PROFILE</p>
    <div class="pg-head">
      {gm_tag(team, "happy", 64, "avatar ff-head-gm")}
      <div>
        <h1 class="pg-title">{esc(n)}</h1>
        <p class="pg-meta">{pos} · {esc(team)} · {pos}{prank[(n, 'ppr')]} in PPR</p>
      </div>
    </div>
    <p class="pg-text">{esc(intro)}</p>

    <section class="pg-section">
      <h2 class="home-h2">Fantasy points by scoring</h2>
      <div class="od-wrap">
        <table class="od-table ff-fmt-table">
          <thead><tr><th scope="col">Scoring</th><th scope="col">Points</th><th scope="col">PPG</th><th scope="col">{pos} rank</th><th scope="col">Overall</th></tr></thead>
          <tbody>{fmt_rows}</tbody>
        </table>
      </div>
      <p class="in-note">Standard: 1 point per 10 rushing or receiving yards, 6 per touchdown, 1 per 25 passing yards, 4 per passing TD, minus 2 per interception. Half PPR and PPR add half or a full point per catch.{' TE Premium adds another half point per catch for tight ends.' if pos == 'TE' else ''}</p>
    </section>

    <section class="pg-section">
      <h2 class="home-h2">2026 stats</h2>
      <p class="in-note">{esc(fantasy.STATS_AS_OF[0].upper() + fantasy.STATS_AS_OF[1:])}</p>
      <dl class="pc-stats pg-stats">{tiles_html}</dl>
    </section>

    <section class="pg-section">
      <h2 class="home-h2">{esc(short(team))} fantasy players</h2>
      {mates_html}
      <p class="pg-more"><a href="../fantasy.html?team={r['t']}">{esc(short(team))} on the leaderboard →</a></p>
    </section>

    <section class="pg-section">
      <h2 class="home-h2">{pos}s near him in PPR</h2>
      <ol class="bb-list">{mini(peers, n)}</ol>
      <p class="pg-more"><a href="../fantasy.html">All fantasy leaders →</a></p>
    </section>

    <section class="pg-cta">
      <div>
        <h2>Can you guess today's mystery player?</h2>
        <p>Fantasle: find the NFL fantasy player in 8 tries.</p>
      </div>
      <a class="pg-button" href="../games/fantasle.html">Play Fantasle</a>
    </section>
    {signup("nfl-player")}"""
        desc = (f"{n} fantasy stats 2026: {ppr:.1f} PPR points ({ppg:.1f} per game), {pos}{prank[(n, 'ppr')]} in PPR. "
                f"Standard, Half PPR and PPR points, ranks and season stats for the {team} {FF_POS_NAME[pos]}.")
        write(f"fantasy/{sl}.html", page(f"fantasy/{sl}.html", f"{n} Fantasy Stats 2026 · {pos}, {short(team)} · Big Head GM",
                                          desc, body, crumbs=[("Fantasy", "fantasy.html"), (n, f"fantasy/{sl}.html")], nav="fantasy.html"))
        paths.append(f"fantasy/{sl}.html")
    return paths


# ---------- Fantasy mock draft (docs/fantasy-draft.html + fantasy-draft.js) ----------

ROOKIE_PPG = (3.0, 0.135)    # rookie PPR points per game = 3 + 0.135 x our rookie score (top rookie WR ~ 16)


def fantasy_draft_data():
    """every player the fantasy mock can draft, with points per game in each scoring format"""
    lead = fantasy.leaders()
    ages = {r["name"]: int(r["age"]) for r in fantasy.read("nfl_ages.csv") if r["age"]}
    fmts = [k for k, _ in fantasy.FORMATS]
    vets, ratio = [], {}
    for pos in ("QB", "RB", "WR", "TE"):
        group = sorted([r for r in lead if r["p"] == pos and r["g"] >= 4], key=lambda r: -r["s"]["ppr"] / r["g"])
        base = {k: sorted(r["s"][k] / r["g"] for r in group[:40])[len(group[:40]) // 2] for k in fmts}
        ratio[pos] = {k: (sum(r["s"][k] for r in group[:30]) / max(1, sum(r["s"]["ppr"] for r in group[:30]))) for k in fmts}
        for r in group + [r for r in lead if r["p"] == pos and 2 <= r["g"] < 4]:
            # few games? pull toward an average starter so one big week doesn't make a star (worth 3 games)
            ppg = [round((r["s"][k] + 3 * base[k]) / (r["g"] + 3), 2) for k in fmts]
            if ppg[2] < 4:
                continue
            real = [round(r["s"][k] / r["g"], 1) for k in fmts]     # what he's actually averaging, shown on the page
            vets.append([r["n"], r["t"], pos, r["g"], ppg, ages.get(r["n"], 0), slug(r["n"]), real])
    rooks = []
    for x in fantasy.rookies():
        a, b = ROOKIE_PPG
        y1 = a + b * x["y1"]["ppr"]
        dyn = a + b * x["dyn"]["ppr"]
        rooks.append([x["n"], x["p"], x["c"], [round(y1 * ratio[x["p"]][k], 2) for k in fmts],
                      [round(dyn * ratio[x["p"]][k], 2) for k in fmts],
                      round(x["age"], 1) if x["age"] else 0, short(x["team"]) if x["team"] else "", slug(x["n"])])
    return {"v": vets, "r": rooks}


def fantasy_draft_page():
    data = json.dumps(fantasy_draft_data(), separators=(",", ":")).replace("</", "<\\/")
    chips = lambda name, opts, on: "".join(
        f'<button class="filter{" active" if v == on else ""}" data-set="{name}" data-v="{v}" aria-pressed="{"true" if v == on else "false"}">{label}</button>'
        for v, label in opts)
    step = lambda key, label, lo, hi, v: (
        f'<div class="fd-step" data-key="{key}" data-lo="{lo}" data-hi="{hi}"><span class="fd-step-label">{label}</span>'
        f'<button class="fd-step-btn" data-d="-1" aria-label="Fewer {label}">−</button><b class="fd-step-v">{v}</b>'
        f'<button class="fd-step-btn" data-d="1" aria-label="More {label}">+</button></div>')
    body = f"""
    <div class="fd" id="fd">
      <section id="fd-setup">
        <p class="eyebrow">FANTASY FOOTBALL</p>
        <h1 class="in-title">Fantasy mock draft</h1>
        <p class="in-sub">Set up your league, then draft against 3 to 15 computer managers. Free, no sign-up.</p>

        <div class="fd-group"><h2 class="fd-h">Teams in your league</h2>
          <div class="in-chips">{chips("teams", [(n, str(n)) for n in (4, 6, 8, 10, 12, 14, 16)], 12)}</div></div>
        <div class="fd-group"><h2 class="fd-h">Your draft spot</h2>
          <div class="in-chips" id="fd-slots"></div></div>
        <div class="fd-group"><h2 class="fd-h">Scoring</h2>
          <div class="in-chips">{chips("fmt", [("ppr", "PPR"), ("half", "Half PPR"), ("std", "Standard"), ("tep", "TE Premium")], "ppr")}</div></div>
        <div class="fd-group"><h2 class="fd-h">League type</h2>
          <div class="in-chips">{chips("kind", [("redraft", "Redraft 2027"), ("dynasty", "Dynasty startup"), ("rookie", "Rookie draft")], "redraft")}</div>
          <p class="in-note" id="fd-kind-note"></p></div>
        <div class="fd-group" id="fd-qb-group"><h2 class="fd-h">Quarterbacks</h2>
          <div class="in-chips">{chips("qb", [("1qb", "1 QB"), ("sf", "Superflex"), ("2qb", "2 QB")], "1qb")}</div></div>
        <div class="fd-group" id="fd-lineup-group"><h2 class="fd-h">Starting lineup</h2>
          <div class="fd-steps">{step("rb", "RB", 1, 3, 2)}{step("wr", "WR", 1, 4, 2)}{step("te", "TE", 0, 2, 1)}{step("flex", "FLEX", 0, 3, 1)}{step("bench", "Bench", 0, 10, 6)}</div>
          <p class="in-note">FLEX can be a RB, WR or TE. Kickers and defenses aren't drafted.</p></div>
        <div class="fd-group" id="fd-rounds-group" hidden><h2 class="fd-h">Rounds</h2>
          <div class="in-chips">{chips("rrounds", [(n, str(n)) for n in (2, 3, 4, 5)], 4)}</div></div>
        <div class="fd-group"><h2 class="fd-h">Draft order</h2>
          <div class="in-chips">{chips("order", [("snake", "Snake"), ("linear", "Linear"), ("third", "3rd-round reversal")], "snake")}</div></div>
        <div class="fd-group"><h2 class="fd-h">Pick speed</h2>
          <div class="in-chips">{chips("speed", [("fast", "Fast"), ("normal", "Normal"), ("slow", "Slow")], "normal")}</div></div>

        <p class="fd-summary" id="fd-summary"></p>
        <button class="start gm-wide" id="fd-start">Start the draft</button>
        <p class="in-note">Rankings use 2026 points per game ({esc(fantasy.STATS_AS_OF)}), adjusted for age, plus our 2027 rookie rankings. <a href="fantasy.html">See the fantasy leaders</a> or <a href="fantasy-trade.html">check a trade</a>.</p>
      </section>

      <section id="fd-draft" hidden>
        <div class="fd-top">
          <div><p class="eyebrow" id="fd-eyebrow"></p><h1 class="fd-title" id="fd-title">Draft room</h1></div>
          <button class="secondary fd-quit" id="fd-quit">Settings</button>
        </div>
        <div class="fd-status" id="fd-status" role="status"></div>
        <div class="fd-mine-wrap">
          <div class="fd-mine-head"><h2 class="section-label">YOUR PICKS</h2><span class="fd-mine-count" id="fd-mine-count"></span></div>
          <ol class="fd-mine" id="fd-mine"></ol>
        </div>
        <div class="fd-cols">
          <div class="fd-main">
            <div class="in-chips fd-filters" id="fd-filters"></div>
            <input class="fd-search" id="fd-search" type="search" placeholder="Search players" autocomplete="off" spellcheck="false" aria-label="Search players">
            <p class="in-note fd-note"><b>'26 PPG</b> is what each player is averaging this season in your scoring. <b>'27 proj</b> is our projection for next season, adjusted for age (rookies included).</p>
            <ol class="fd-board" id="fd-board"></ol>
            <div class="fd-bar">
              <button class="secondary" id="fd-pause">Pause</button>
              <button class="secondary" id="fd-auto">Auto-pick for me</button>
            </div>
          </div>
          <aside class="fd-side">
            <h2 class="section-label">YOUR TEAM</h2>
            <ol class="fd-roster" id="fd-roster"></ol>
            <h2 class="section-label">LATEST PICKS</h2>
            <ol class="fd-feed" id="fd-feed"></ol>
          </aside>
        </div>
      </section>

      <section id="fd-results" hidden>
        <p class="eyebrow" id="fd-r-eyebrow">DRAFT COMPLETE</p>
        <div class="fd-grade" id="fd-grade"></div>
        <h2 class="home-h2" id="fd-r-head">Your starting lineup</h2>
        <ol class="fd-roster" id="fd-r-lineup"></ol>
        <h2 class="home-h2">League power rankings</h2>
        <p class="in-note" id="fd-power-note"></p>
        <ol class="fd-power" id="fd-power"></ol>
        <h2 class="home-h2">Full draft board</h2>
        <div class="fd-grid-wrap"><table class="fd-grid" id="fd-grid"></table></div>
        <div class="fd-again">
          <button class="secondary" id="fd-settings">Change settings</button>
          <button class="start" id="fd-again">Draft again</button>
        </div>
      </section>
    </div>
    <script id="fd-data" type="application/json">{data}</script>
    {signup("fantasy-draft")}"""
    desc = ("Free fantasy football mock draft for 2027. Pick 4, 6, 8, 10, 12, 14 or 16 teams, PPR, Half PPR, Standard or TE Premium, "
            "Superflex or 2 QB, your own lineup, snake or linear, redraft, dynasty startup or rookie draft.")
    return page("fantasy-draft.html", "Fantasy Football Mock Draft 2027 · PPR, Superflex, Dynasty · Big Head GM", desc,
                body, crumbs=[("Fantasy", "fantasy.html"), ("Mock draft", "fantasy-draft.html")], nav="fantasy.html",
                scripts=("fantasy-draft.js?v=4",))



def fantasy_trade_page():
    data = json.dumps(fantasy_draft_data(), separators=(",", ":")).replace("</", "<\\/")
    chips = lambda name, opts, on: "".join(
        f'<button class="filter{" active" if v == on else ""}" data-set="{name}" data-v="{v}" aria-pressed="{"true" if v == on else "false"}">{label}</button>'
        for v, label in opts)
    side = lambda key, title: f"""
          <div class="ft-side">
            <div class="ft-side-head"><h2 class="ft-h">{title}</h2><span class="ft-total">Value <b id="ft-{key}-total">0</b></span></div>
            <ol class="ft-list" id="ft-{key}-list"></ol>
            <div class="ft-search">
              <label class="sr-only" for="ft-{key}-q">Add a player to {title.lower()}</label>
              <input id="ft-{key}-q" type="search" placeholder="+ Add a player" autocomplete="off" spellcheck="false">
              <ul class="ft-sug" id="ft-{key}-sug" role="listbox" hidden></ul>
            </div>
          </div>"""
    body = f"""
    <div class="ft" id="ft">
      <p class="eyebrow">FANTASY FOOTBALL</p>
      <h1 class="in-title">Fantasy trade analyzer</h1>
      <p class="in-sub">Add the players on each side and see who wins the trade, for your league's scoring. Free, no sign-up.</p>

      <div class="ft-settings">
        <div class="ft-set"><span class="fd-h">Scoring</span><div class="in-chips">{chips("fmt", [("ppr", "PPR"), ("half", "Half PPR"), ("std", "Standard"), ("tep", "TE Premium")], "ppr")}</div></div>
        <div class="ft-set"><span class="fd-h">Teams</span><div class="in-chips">{chips("teams", [(n, str(n)) for n in (8, 10, 12, 14, 16)], 12)}</div></div>
        <div class="ft-set"><span class="fd-h">Quarterbacks</span><div class="in-chips">{chips("qb", [("1qb", "1 QB"), ("sf", "Superflex"), ("2qb", "2 QB")], "1qb")}</div></div>
        <div class="ft-set"><span class="fd-h">League</span><div class="in-chips">{chips("kind", [("redraft", "Redraft (rest of 2026)"), ("dynasty", "Dynasty")], "redraft")}</div></div>
      </div>
      <p class="in-note" id="ft-kind-note"></p>

      <p class="ft-example" id="ft-example" hidden>This is an example trade. Remove players or tap <b>Clear</b> to start your own.</p>
      <div class="ft-sides">{side("give", "You give")}
        <button class="ft-swap" id="ft-swap" aria-label="Swap sides">⇄</button>{side("get", "You get")}
      </div>

      <div class="ft-verdict" id="ft-verdict" aria-live="polite"></div>
      <div class="ft-balance" id="ft-balance" hidden></div>

      <div class="ft-actions">
        <button class="secondary" id="ft-clear">Clear</button>
        <button class="start" id="ft-share">Copy link to this trade</button>
      </div>
      <p class="in-note" id="ft-share-note" role="status"></p>

      <h2 class="home-h2">How the values work</h2>
      <ul class="gm-rules">
        <li><b>Value</b> runs from 0 to 100. It's how many more points a player should score than a typical starter you could pick up off waivers, in your scoring and league size.</li>
        <li>Stars are worth more than two average starters added together, and each extra player in a trade counts a little less. You only get so many lineup spots.</li>
        <li><b>Redraft</b> uses each player's 2026 points per game, steadied for players who've missed games. <b>Dynasty</b> also weighs age and adds the 2027 rookies and rookie picks.</li>
        <li>In 1 QB leagues, quarterbacks are worth less than their points suggest, since good ones are easy to find. Superflex and 2 QB change that.</li>
        <li>Injuries and news aren't counted. Check them before you accept.</li>
      </ul>
      <p class="in-note">Stats {esc(fantasy.STATS_AS_OF)}. Updated every Tuesday.</p>
      <p class="pg-more"><a href="fantasy-draft.html">Try the fantasy mock draft →</a></p>
    </div>
    <script id="ft-data" type="application/json">{data}</script>
    {signup("fantasy-trade")}"""
    desc = ("Free fantasy football trade analyzer for 2026. See who wins your trade in PPR, Half PPR, Standard or TE Premium, "
            "1 QB or Superflex, redraft or dynasty with 2027 rookie picks.")
    return page("fantasy-trade.html", "Fantasy Football Trade Analyzer 2026 · Who Wins the Trade · Big Head GM", desc,
                body, crumbs=[("Fantasy", "fantasy.html"), ("Trade analyzer", "fantasy-trade.html")], nav="fantasy.html",
                scripts=("fantasy-trade.js?v=2",))


def fantasy_ros_page():
    ros = fantasy.rest_of_season()
    for r in ros["players"]:
        r["slug"] = slug(r["n"])
    data = json.dumps(ros, separators=(",", ":")).replace("</", "<\\/")
    fmt_btns = "".join(f'<button class="filter{" active" if k == "ppr" else ""}" data-fmt="{k}" aria-pressed="{"true" if k == "ppr" else "false"}">{label}</button>'
                       for k, label in fantasy.FORMATS)
    pos_btns = "".join(f'<button class="filter{" active" if p == "All" else ""}" data-pos="{p}" aria-pressed="{"true" if p == "All" else "false"}">{p}</button>'
                       for p in ("All", "QB", "RB", "WR", "TE"))
    weeks = f'Weeks {ros["from"]}–{ros["to"]}'
    body = f"""
    <div class="rs">
      <p class="eyebrow">FANTASY FOOTBALL · {weeks.upper()}</p>
      <h1 class="in-title">Rest-of-season rankings and playoff schedules</h1>
      <p class="in-sub">Every player ranked on what he should score from Week {ros["from"]} through Week {ros["to"]}, using his points per game, his bye and who he plays. Green means an easy matchup, red a tough one. Fantasy playoffs are Weeks 15–17.</p>

      <div class="ff-bar"><p class="ff-label">Your scoring</p><div class="in-chips" id="rs-fmt">{fmt_btns}</div></div>
      <div class="rs-tools">
        <div class="in-chips" id="rs-pos">{pos_btns}</div>
        <label class="rs-check"><input type="checkbox" id="rs-out"> Show players who haven't played lately</label>
      </div>
      <div class="rs-key" aria-hidden="true"><span class="rs-m g2">Easy</span><span class="rs-m g1">Good</span><span class="rs-m n">Average</span><span class="rs-m r1">Tough</span><span class="rs-m r2">Very tough</span><span class="rs-m bye">BYE</span></div>

      <div class="rs-wrap">
        <table class="rs-table">
          <thead><tr><th scope="col">#</th><th scope="col" class="rs-pl">Player</th><th scope="col" title="Projected fantasy points, Weeks {ros['from']}–{ros['to']}">Proj</th><th scope="col">PPG</th>
            {"".join(f'<th scope="col" class="rs-w{" po" if w in ros["playoffs"] else ""}">{w}</th>' for w in range(ros["from"], ros["to"] + 1))}</tr></thead>
          <tbody id="rs-body"></tbody>
        </table>
      </div>
      <button class="secondary gm-wide" id="rs-more">Show more</button>

      <h2 class="home-h2">Easiest fantasy playoff schedules</h2>
      <p class="in-note">Teams whose Week 15–17 opponents give up the most fantasy points to each position. Good to know before your trade deadline.</p>
      <div class="rs-po" id="rs-po"></div>

      <h2 class="home-h2">How it works</h2>
      <ul class="gm-rules">
        <li><b>Matchups:</b> for each defense, we add up the fantasy points it has allowed to each position per game this season and compare it with an average defense. "Easy" gives up about 10% or more above average, "very tough" about 10% or more below.</li>
        <li><b>Projection:</b> a player's points per game (mostly his season average, with extra weight on his last 3 games) times each week's matchup, with 0 on his bye week.</li>
        <li>Injuries and depth chart news aren't counted. Players who haven't played in 2+ of their team's games are hidden unless you turn them on.</li>
      </ul>
      <div class="ff-ctas">{FF_TRADE_CTA}{FF_CTA}</div>
      <p class="od-fine">Stats and schedule: <a href="https://github.com/nflverse" rel="noopener nofollow">nflverse</a> and FFToday, {esc(fantasy.STATS_AS_OF)}. Updated every Tuesday.</p>
    </div>
    <script type="application/json" id="rs-data">{data}</script>
    {signup("fantasy-ros")}"""
    desc = (f"Rest-of-season fantasy football rankings for {weeks} of 2026 with matchups, bye weeks and fantasy playoff schedules (Weeks 15–17). "
            "PPR, Half PPR, Standard and TE Premium.")
    return page("fantasy-ros.html", f"Rest of Season Fantasy Rankings 2026 · Playoff Schedules · Big Head GM", desc, body,
                crumbs=[("Fantasy", "fantasy.html"), ("Rest of season", "fantasy-ros.html")], nav="fantasy.html",
                scripts=("fantasy-ros.js?v=1",))


def fantasy_startsit_page():
    ros = fantasy.rest_of_season()
    trend = fantasy.trends()
    recent = {r["n"]: r for r in trend["players"]} if trend["ready"] else {}
    days = sorted(g["day"] for g in fantasy.read("fantasy_schedule.csv") if int(g["week"]) == ros["from"])
    when = ""
    if days:
        d0, d1 = datetime.date.fromisoformat(days[0]), datetime.date.fromisoformat(days[-1])
        when = f'{d0.strftime("%b")} {d0.day}–{d1.day}' if d0.month == d1.month else f'{d0.strftime("%b")} {d0.day}–{d1.strftime("%b")} {d1.day}'
    rows = []
    for r in ros["players"]:
        w, opp, m = r["sched"][0]
        t = recent.get(r["n"])
        rows.append({"n": r["n"], "t": r["t"], "p": r["p"], "slug": slug(r["n"]), "ppg": r["ppg"], "opp": opp, "m": m,
                     "sd": r["sd"], "out": r["out"],
                     "hot": [t["was"]["ppr"], t["now"]["ppr"]] if t and t["g0"] >= 2 and t["gw"] >= 2 else None,
                     "use": [round(t["tgt"][0] + (t["car"][0] if r["p"] == "RB" else 0), 1),
                             round(t["tgt"][1] + (t["car"][1] if r["p"] == "RB" else 0), 1)] if t and t["g0"] >= 2 and t["gw"] >= 2 and r["p"] != "QB" else None})
    data = json.dumps({"week": ros["from"], "when": when, "span": [trend.get("from"), trend.get("to")], "players": rows},
                      separators=(",", ":")).replace("</", "<\\/")
    fmt_btns = "".join(f'<button class="filter{" active" if k == "ppr" else ""}" data-fmt="{k}" aria-pressed="{"true" if k == "ppr" else "false"}">{label}</button>'
                       for k, label in fantasy.FORMATS)
    body = f"""
    <div class="ss" id="ss">
      <p class="eyebrow">FANTASY FOOTBALL · WEEK {ros["from"]}{(" · " + when.upper()) if when else ""}</p>
      <h1 class="in-title">Start or sit?</h1>
      <p class="in-sub">Add the players you're deciding between. We'll tell you who to start this week, based on his scoring, how he's played lately and who he's facing.</p>

      <div class="ft-settings">
        <div class="ft-set"><span class="fd-h">Scoring</span><div class="in-chips" id="ss-fmt">{fmt_btns}</div></div>
        <div class="ft-set"><span class="fd-h">How many do you start?</span><div class="in-chips" id="ss-n">
          <button class="filter active" data-n="1" aria-pressed="true">1</button><button class="filter" data-n="2" aria-pressed="false">2</button><button class="filter" data-n="3" aria-pressed="false">3</button></div></div>
      </div>

      <p class="ft-example" id="ss-example" hidden>This is an example. Remove players or tap <b>Clear</b> to check your own.</p>
      <div class="ss-verdict" id="ss-verdict" aria-live="polite"></div>
      <ol class="ss-cards" id="ss-cards"></ol>
      <div class="ft-search ss-search">
        <label class="sr-only" for="ss-q">Add a player</label>
        <input id="ss-q" type="search" placeholder="+ Add a player (up to 6)" autocomplete="off" spellcheck="false">
        <ul class="ft-sug" id="ss-sug" role="listbox" hidden></ul>
      </div>
      <div class="ft-actions">
        <button class="secondary" id="ss-clear">Clear</button>
        <button class="start" id="ss-share">Copy link to ask your league</button>
      </div>
      <p class="in-note" id="ss-share-note" role="status"></p>

      <h2 class="home-h2">How we decide</h2>
      <ul class="gm-rules">
        <li><b>Projection</b> = his points per game (season average with extra weight on his last 3 games) times this week's matchup: how many fantasy points his opponent gives up to his position compared with an average defense.</li>
        <li><b>Range</b> is a normal bad week to a normal good week, from how much his scoring has swung this season.</li>
        <li><b>Lately</b> compares his last 3 games with the rest of the season. <b>Touches</b> are targets, plus carries for running backs.</li>
        <li>Injuries, weather and late news aren't counted. Check them before kickoff.</li>
      </ul>
      <div class="ff-ctas">{FF_ROS_CTA}{FF_TRADE_CTA}{FF_CTA}</div>
      <p class="od-fine">Stats and schedule: <a href="https://github.com/nflverse" rel="noopener nofollow">nflverse</a> and FFToday, {esc(fantasy.STATS_AS_OF)}. Updated every Tuesday.</p>
    </div>
    <script type="application/json" id="ss-data">{data}</script>
    {signup("fantasy-startsit")}"""
    desc = (f"Free fantasy football start/sit tool for Week {ros['from']} of 2026. Compare players and see who to start, "
            "with projections, matchups and recent form in PPR, Half PPR, Standard or TE Premium.")
    return page("fantasy-start-sit.html", f"Who Should I Start? Week {ros['from']} Fantasy Start/Sit Tool · Big Head GM", desc, body,
                crumbs=[("Fantasy", "fantasy.html"), ("Start/sit", "fantasy-start-sit.html")], nav="fantasy.html",
                scripts=("fantasy-start-sit.js?v=3",))

# ---------- Fantasle (guess the NFL fantasy player) ----------

DIVISION = {}
for div, abbrs in {"AFC East": "BUF MIA NE NYJ", "AFC North": "BAL CIN CLE PIT", "AFC South": "HOU IND JAX TEN",
                   "AFC West": "DEN KC LV LAC", "NFC East": "DAL NYG PHI WAS", "NFC North": "CHI DET GB MIN",
                   "NFC South": "ATL CAR NO TB", "NFC West": "ARI LAR SF SEA"}.items():
    for a in abbrs.split():
        DIVISION[a] = div
FANTASLE_POOL = 60           # the daily answer is one of the top 60 in PPR points per game


def fantasle_page():
    full = {FF_TEAM[a]: next(t for t in team_names if t.endswith(FF_TEAM[a])) for a in FF_TEAM}
    lead = fantasy.leaders()
    ranked = sorted([r for r in lead if r["g"] >= 5], key=lambda r: -r["s"]["ppr"] / r["g"])[:FANTASLE_POOL]
    pool = {r["n"] for r in ranked}
    stats = {r["name"]: r for r in fantasy.read("fantasy_stats.csv")}
    ages = {r["name"]: int(r["age"]) for r in fantasy.read("nfl_ages.csv") if r["age"]}
    rows = []
    for r in lead:
        s_ = stats[r["n"]]
        team = full.get(FF_TEAM.get(r["t"], ""), r["t"])
        rows.append([r["n"], r["t"], team, DIVISION[r["t"]].replace("North", "N").replace("South", "S").replace("East", "E").replace("West", "W"),
                     r["p"], round(r["s"]["ppr"] / r["g"], 1),
                     int(fantasy.f(s_["pass_td"]) + fantasy.f(s_["rush_td"]) + fantasy.f(s_["rec_td"])),
                     int(fantasy.f(s_["pass_yds"]) + fantasy.f(s_["rush_yds"]) + fantasy.f(s_["rec_yds"])),
                     int(fantasy.f(s_["rec"])), 1 if r["n"] in pool else 0, slug(r["n"]), ages.get(r["n"], 0)])
    data = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    body = f"""
    <div class="gm-shell pl-shell" id="fantasle">
      <div class="gm-top">
        <div><p class="eyebrow" id="pl-eyebrow">DAILY</p><h1 class="gm-title">Fantasle</h1></div>
        <a class="gm-exit" href="./">All games</a>
      </div>
      <div class="in-chips pl-modes" id="pl-modes">
        <button class="filter active" data-mode="daily" aria-pressed="true">Daily</button>
        <button class="filter" data-mode="unlimited" aria-pressed="false">Unlimited</button>
        <button class="filter" data-mode="help" aria-pressed="false">How to play</button>
        <button class="filter" data-mode="stats" aria-pressed="false">Stats</button>
      </div>

      <section class="gm-panel" id="pl-help" hidden>
        <p class="pg-text">Guess the mystery <b>NFL fantasy player</b> in <b>8 tries</b>. Every QB, RB, WR and TE in our 2026 fantasy rankings is fair game. After each guess, every box tells you how close you are.</p>
        <ul class="gm-rules">
          <li><span class="pl-key g"></span> <b>Green</b>: exact match.</li>
          <li><span class="pl-key y"></span> <b>Yellow</b>: close. Division is yellow when he's in the same conference (AFC or NFC). Position is yellow for another RB/WR/TE. Numbers are yellow within 3 PPG, 150 yards, 2 touchdowns or 2 years of age.</li>
          <li><b>↑</b> means the mystery player's number is higher. <b>↓</b> means it's lower.</li>
          <li>Arrows and words describe the <b>mystery player</b> compared with your guess: <b>↑ Higher / ↓ Lower</b> PPG, <b>↑ More / ↓ Fewer</b> yards and touchdowns, <b>↑ Older / ↓ Younger</b>.</li>
          <li><b>PPG</b> is PPR fantasy points per game. <b>Yds</b> and <b>TD</b> count passing, rushing and receiving together. Season totals {fantasy.STATS_AS_OF}.</li>
        </ul>
        <p class="pg-text">The daily player is the same for everyone and changes at midnight Eastern. Unlimited gives you a new player every round.</p>
        <button class="start gm-wide" id="pl-help-close">Play</button>
      </section>

      <section class="gm-panel" id="pl-stats" hidden>
        <div class="pl-statrow" id="pl-statrow"></div>
        <h2 class="home-h2">Guesses (daily)</h2>
        <div class="pl-dist" id="pl-dist"></div>
        <button class="start gm-wide" id="pl-stats-close">Back to the game</button>
      </section>

      <section class="gm-panel" id="pl-game">
        <p class="in-note pl-count" id="pl-count">Guess 1 of 8</p>
        <div class="pl-head" aria-hidden="true"><span>Team</span><span>Div</span><span>Pos</span><span>PPG</span><span>Yds</span><span>TD</span><span>Age</span></div>
        <ol class="pl-board" id="pl-board" aria-live="polite"></ol>
        <div class="pl-search">
          <label class="sr-only" for="pl-input">Guess an NFL player</label>
          <input id="pl-input" type="search" placeholder="Type a player's name" autocomplete="off" autocapitalize="words" spellcheck="false">
          <ul class="pl-suggest" id="pl-suggest" role="listbox" hidden></ul>
        </div>
        <div class="pl-done" id="pl-done" hidden>
          <div class="pl-reveal">
            <span class="pl-gm" id="pl-gm"></span>
            <div><p class="pl-result" id="pl-result"></p><a class="pl-name" id="pl-answer" href="#"></a><span class="pl-meta" id="pl-meta"></span></div>
          </div>
          <p class="bz-squares pl-squares" id="pl-squares" aria-hidden="true"></p>
          <div class="bz-buttons">
            <button class="secondary" id="pl-share">Share</button>
            <button class="start" id="pl-next">Play unlimited</button>
          </div>
          <p class="in-note" id="pl-share-note" role="status"></p>
          <p class="in-note" id="pl-countdown"></p>
          <p class="pg-more"><a href="../fantasy.html">See the full fantasy leaderboard →</a></p>
        </div>
        <button class="pl-giveup" id="pl-giveup">Give up</button>
      </section>
      {signup("fantasle")}
    </div>
    <script type="application/json" id="pl-data">{data}</script>"""
    write("games/fantasle.html", page("games/fantasle.html", "Fantasle: Guess the NFL Fantasy Player · Big Head GM",
          "Fantasle is a free daily NFL fantasy football guessing game. Guess the mystery player in 8 tries from his team, division, position, PPR points per game, touchdowns, yards and catches.",
          body, nav="games/", scripts=("games/fantasle.js?v=7",), body_class="info-page game-page", og_title="Fantasle: guess today's mystery NFL fantasy player"))


# ---------- home page: today's games and fantasy leaders ----------

def home_mock():
    """the home page's 7-round mock: the same logical mock as the team pages (consensus.py)"""
    via = {o["pick"]: o["from"] for o in order}
    picks = [(s_, by_name.get(p["name"], p)) for s_, p in MOCK_LIST]
    out = ""
    for s_, pl in picks:
        t = s_["team"]
        tint = gm_info.get(t, {}).get("tint", "#2A323D")
        frm = f' <i>via {esc(short(via[s_["pick"]]))}</i>' if via.get(s_["pick"]) else ""
        nm = f'<a class="hm-name" href="players/{pl["slug"]}.html">{esc(pl["name"])}</a>' if pl.get("slug") else f'<b class="hm-name">{esc(pl["name"])}</b>'
        out += (f'<li data-round="{s_["round"]}" data-team="{esc(t)}"{"" if s_["round"] == 1 else " hidden"}><span class="hm-pick">{s_["pick"]}</span>'
                f'<a class="hm-team" href="teams/{slug(t)}.html" style="--tint:{tint}">{esc(short(t))}</a>'
                f'<span class="hm-text">{nm}<span>{esc(pl["position"])} · {esc(pl["college"])}{frm}</span></span></li>')
    return out


def home_blocks():
    lead = fantasy.leaders()
    MIN_GP = 4
    ppg = lambda r: r["s"]["ppr"] / r["g"]
    keep = []
    for pos in FF_POS_NAME:          # the top 30 at each position by PPR points per game
        keep += sorted([r for r in lead if r["p"] == pos and r["g"] >= MIN_GP], key=lambda r: -ppg(r))[:30]
    keep.sort(key=lambda r: -ppg(r))
    prank = {}
    for pos in FF_POS_NAME:
        for i, r in enumerate(sorted([x for x in lead if x["p"] == pos], key=lambda x: -x["s"]["ppr"]), 1):
            prank[r["n"]] = i
    full = {FF_TEAM[a]: next(t for t in team_names if t.endswith(FF_TEAM[a])) for a in FF_TEAM}
    rows = "".join(
        f'<li data-pos="{r["p"]}" data-team="{esc(full.get(FF_TEAM.get(r["t"], ""), r["t"]))}" data-posrank="{prank[r["n"]]}" '
        f'data-ppg="{ppg(r):.1f}" data-pts="{r["s"]["ppr"]:.1f}" data-gp="{r["g"]}" data-half="{r["s"]["half"]:.1f}" '
        f'data-std="{r["s"]["std"]:.1f}" data-line="{esc(r["line"])}"><span class="hf-rk">{i}</span><span class="hf-name"><a class="hf-link" href="fantasy/{slug(r["n"])}.html">{esc(r["n"])}</a>'
        f'<span>{r["p"]} · {esc(FF_TEAM.get(r["t"], r["t"]))} · {r["s"]["ppr"]:.1f} pts · {r["g"]} GP</span></span>'
        f'<span class="hf-ppg"><b>{ppg(r):.1f}</b><span>PPG</span></span></li>'
        for i, r in enumerate(keep, 1))
    chips = "".join(f'<button class="filter{" active" if p_ == "All" else ""}" data-pos="{p_}" aria-pressed="{"true" if p_ == "All" else "false"}">{p_}</button>'
                    for p_ in ("All", "QB", "RB", "WR", "TE"))
    block = f"""<!-- home-daily:start (written by build_pages.py) -->
    <section class="home-daily">
      <div class="wrap">
        <div class="home-h2-row">
          <h2 class="home-h2">Today's daily games</h2>
          <span class="section-note">New player every day</span>
        </div>
        <div class="hd-grid">
          <a class="hd-card" href="games/prospectle.html">
            <span class="hd-tiles" aria-hidden="true"><i class="g">SEC</i><i class="y">WR</i><i>6-2</i><i class="g">#7</i></span>
            <b>Prospectle</b>
            <span>Guess the mystery 2027 draft prospect in 8 tries.</span>
            <span class="pg-go">Play today's →</span>
          </a>
          <a class="hd-card" href="games/fantasle.html">
            <span class="hd-tiles" aria-hidden="true"><i class="g">WR</i><i class="y">25.7</i><i>NFC W</i><i class="g">9</i></span>
            <b>Fantasle</b>
            <span>Guess the mystery NFL fantasy player from his PPR stats.</span>
            <span class="pg-go">Play today's →</span>
          </a>
          <a class="hd-card" href="games/17-0.html">
            <span class="hd-tiles hd-p17" aria-hidden="true">🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩</span>
            <b>17-0</b>
            <span>Draft a PPR lineup from random teams. Can it go undefeated?</span>
            <span class="pg-go">Play today's →</span>
          </a>
        </div>

        <div class="home-h2-row hf-head">
          <h2 class="home-h2">2027 mock draft</h2>
          <span class="section-note">All 7 rounds · from {SIMS} simulations</span>
        </div>
        <div class="hf-card hf-wide">
          <div class="in-chips hf-chips" id="hm-rounds" aria-label="Round">{"".join(f'<button class="filter{" active" if r_ == 1 else ""}" data-round="{r_}" aria-pressed="{"true" if r_ == 1 else "false"}" aria-label="Round {r_}">R{r_}</button>' for r_ in range(1, 8))}</div>
          <label class="hm-team-pick"><span class="hm-team-label">Or pick a team to see its full 7-round mock</span>
            <select id="hm-team"><option value="">🏈 Choose a team</option>{"".join(f'<option value="{esc(t)}">{esc(t)}</option>' for t in team_names)}</select></label>
          <ol class="hf-list hf-scroll hm-list" id="hm-list">{home_mock()}</ol>
          <p class="hf-foot">At each pick: the player that team takes most often in our simulations who's still on the board.</p>
          <a class="pg-go" href="?start=1">Think you can do better? Run your own mock →</a>
        </div>
        <script>
          (function () {{
            var list = document.getElementById("hm-list"), chips = document.querySelectorAll("#hm-rounds .filter"),
                pick = document.getElementById("hm-team");
            function show(test) {{
              Array.prototype.forEach.call(list.children, function (li) {{ li.hidden = !test(li); }});
              list.scrollTop = 0;
            }}
            chips.forEach(function (c) {{
              c.addEventListener("click", function () {{
                var r = c.getAttribute("data-round");
                chips.forEach(function (x) {{ x.classList.toggle("active", x === c); x.setAttribute("aria-pressed", x === c ? "true" : "false"); }});
                pick.value = "";
                list.classList.remove("by-team");
                show(function (li) {{ return li.getAttribute("data-round") === r; }});
              }});
            }});
            pick.addEventListener("change", function () {{
              var t = pick.value;
              if (!t) {{ chips[0].click(); return; }}
              chips.forEach(function (x) {{ x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); }});
              list.classList.add("by-team");
              show(function (li) {{ return li.getAttribute("data-team") === t; }});
            }});
          }})();
        </script>

        <div class="home-h2-row hf-head">
          <h2 class="home-h2">Fantasy leaders</h2>
          <span class="section-note">PPR · {esc(fantasy.STATS_AS_OF.replace(" of the 2026 season", ""))}</span>
        </div>
        <div class="hf-card hf-wide">
          <div class="in-chips hf-chips" id="hf-pos" aria-label="Position">{chips}</div>
          <ol class="hf-list hf-scroll" id="hf-list">{rows}</ol>
          <p class="hf-foot">Ranked by PPR points per game (PPG), {MIN_GP}+ games played. Scroll for more.</p>
          <a class="pg-go" href="fantasy.html">All {len(lead)} players, every scoring format →</a>
        </div>
        {FF_CTAS}
        <dialog class="pop" id="pop" aria-label="Player">
          <button class="pop-close" id="pop-close" aria-label="Close">✕</button>
          <div id="pop-body"></div>
        </dialog>
        <script src="home-pop.js?v=1" defer></script>
        <script>
          (function () {{
            var list = document.getElementById("hf-list"), chips = document.querySelectorAll("#hf-pos .filter");
            chips.forEach(function (c) {{
              c.addEventListener("click", function () {{
                var pos = c.getAttribute("data-pos"), n = 0;
                chips.forEach(function (x) {{ x.classList.toggle("active", x === c); x.setAttribute("aria-pressed", x === c ? "true" : "false"); }});
                Array.prototype.forEach.call(list.children, function (li) {{
                  var on = pos === "All" || li.getAttribute("data-pos") === pos;
                  li.hidden = !on;
                  if (on) li.querySelector(".hf-rk").textContent = ++n;
                }});
                list.scrollTop = 0;
              }});
            }});
          }})();
        </script>
      </div>
    </section>
    <!-- home-daily:end -->"""
    path = os.path.join(DOCS, "index.html")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    text = re.sub(r"<!-- home-daily:start.*?<!-- home-daily:end -->", lambda m: block, text, flags=re.S)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


# ---------- 17-0 (draft a PPR lineup from random teams, play a 17-week season) ----------

def perfect_page():
    lead = fantasy.leaders()
    full = {FF_TEAM[a]: next(t for t in team_names if t.endswith(FF_TEAM[a])) for a in FF_TEAM}
    tg = {}
    for r in lead:
        tg[r["t"]] = max(tg.get(r["t"], 0), r["g"])
    ppg = lambda r: r["s"]["ppr"] / r["g"]
    by = {pos: sorted([r for r in lead if r["p"] == pos and r["g"] >= 4], key=lambda r: -ppg(r)) for pos in FF_POS_NAME}
    nth = lambda pos, n: ppg(by[pos][n - 1])
    # a typical opponent: about a 12-team league's median starters, a bit easier so 17-0 stays possible
    opp = 0.95 * (nth("QB", 12) + nth("RB", 12) + nth("RB", 24) + nth("WR", 12) + nth("WR", 24) + nth("TE", 12) + nth("WR", 30))
    rows = [[r["n"], slug(r["n"]), r["t"], full.get(FF_TEAM.get(r["t"], ""), r["t"]), r["p"], round(ppg(r), 2), r["g"], tg[r["t"]]]
            for r in lead]
    data = json.dumps({"opp": round(opp, 1), "players": rows}, separators=(",", ":")).replace("</", "<\\/")
    body = f"""
    <div class="gm-shell p17-shell" id="perfect">
      <div class="gm-top">
        <div><p class="eyebrow" id="p17-eyebrow">BIG HEAD GM GAMES</p><h1 class="gm-title">17-0</h1></div>
        <a class="gm-exit" href="./">All games</a>
      </div>

      <section class="gm-panel" id="p17-intro">
        <p class="pg-text">Build a PPR fantasy lineup one random NFL team at a time, then see if it can go <b>17-0</b>.</p>
        <ul class="gm-rules">
          <li>Each round spins a team. Take <b>one player</b> from it for an open spot: QB, RB, RB, WR, WR, TE and FLEX (RB, WR or TE).</li>
          <li>Each player shows his <b>PPR points per game</b> and games played. Pick smart: a big average from a guy who keeps missing games can cost you. You get <b>one re-spin</b>.</li>
          <li>Your season uses each player's real 2026 PPR points per game, with good and bad weeks. Players who've missed games this year can miss games for you too.</li>
        </ul>
        <button class="start gm-wide" id="p17-daily">Play today's draft</button>
        <button class="secondary gm-wide" id="p17-free">Free play</button>
        <button class="secondary gm-wide" id="p17-board-open" hidden>Leaderboards</button>
        <p class="in-note" id="p17-intro-best">Today's draft: same teams for everyone, new teams at midnight Eastern.</p>
      </section>

      <section class="gm-panel" id="p17-draft" hidden>
        <p class="in-note p17-round" id="p17-round">Round 1 of 7</p>
        <div class="p17-team" id="p17-team"><span class="p17-gm" id="p17-gm"></span><b id="p17-team-name">…</b></div>
        <ul class="p17-list" id="p17-list"></ul>
        <button class="secondary gm-wide" id="p17-respin" hidden>Re-spin</button>
        <h2 class="home-h2 p17-h2">Your lineup</h2>
        <ol class="p17-lineup" id="p17-lineup"></ol>
      </section>

      <section class="gm-panel" id="p17-season" hidden>
        <div class="p17-head"><h2 class="home-h2" id="p17-head">Draft complete!</h2><span class="p17-record" id="p17-record" hidden>0-0</span></div>
        <p class="in-note" id="p17-proj"></p>
        <button class="start gm-wide p17-kick" id="p17-play">Kick off the season ▶</button>
        <ol class="p17-lineup" id="p17-lineup-s"></ol>
        <ol class="p17-weeks" id="p17-weeks"></ol>
        <div class="pl-done p17-end" id="p17-end" hidden>
          <p class="p17-title" id="p17-title"></p>
          <p class="pl-meta" id="p17-line"></p>
          <p class="bz-squares pl-squares" id="p17-squares" aria-hidden="true"></p>
          <div class="bz-buttons">
            <button class="secondary" id="p17-share">Share</button>
            <button class="start" id="p17-again">Free play</button>
          </div>
          <p class="in-note" id="p17-note" role="status"></p>
          <form class="p17-post" id="p17-post" hidden>
            <label for="p17-name" id="p17-post-label">Put your record on today's leaderboard</label>
            <div class="p17-post-row">
              <input id="p17-name" maxlength="20" placeholder="Your name" autocomplete="nickname" autocapitalize="words">
              <button class="start" id="p17-post-btn" type="submit">Post my record</button>
            </div>
          </form>
          <p class="in-note" id="p17-post-note" role="status"></p>
          <button class="text-button p17-board-link" id="p17-board-link" type="button" hidden>See today's leaderboard →</button>
          <p class="in-note" id="p17-best"></p>
          <p class="pg-more"><a href="../fantasy.html">See every player's PPR stats →</a></p>
        </div>
      </section>
      <section class="gm-panel p17-board" id="p17-board" hidden>
        <div class="p17-head"><h2 class="home-h2">Leaderboard</h2><span class="in-note" id="p17-board-day"></span></div>
        <div class="in-chips p17-chips" id="p17-board-modes">
          <button class="filter active" data-board="daily" aria-pressed="true">Daily</button>
          <button class="filter" data-board="free" aria-pressed="false">Free play</button>
        </div>
        <div class="in-chips p17-chips p17-sort" id="p17-board-sort" aria-label="Sort by">
          <span class="in-note">Sort:</span>
          <button class="filter active" data-sort="ppg" aria-pressed="true">Team PPG</button>
          <button class="filter" data-sort="wins" aria-pressed="false">Best record</button>
        </div>
        <p class="in-note" id="p17-board-sum"></p>
        <ol class="p17-rank" id="p17-board-list"></ol>
        <h3 class="ff-grp">17-0 Hall of Fame</h3>
        <ol class="p17-rank p17-hof" id="p17-hof"></ol>
      </section>
      {signup("17-0")}
    </div>
    <script type="application/json" id="p17-data">{data}</script>"""
    write("games/17-0.html", page("games/17-0.html", "17-0: Draft a Fantasy Team and Go Undefeated · Big Head GM",
          "17-0 is a free fantasy football game. Draft a PPR lineup one random NFL team at a time, then play a 17-week season with real 2026 stats. Can you go undefeated?",
          body, nav="games/", scripts=("games/perfect.js?v=7",), body_class="info-page game-page", og_title="17-0: can your fantasy team go undefeated?"))


# ---------- sitemap ----------

def sitemap(paths):
    day = TODAY.isoformat()
    urls = "".join(f"  <url><loc>{SITE}{p}</loc><lastmod>{day}</lastmod></url>\n" for p in paths)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n")


def main():
    paths = ["", "players/", "teams/", "odds.html", "insights.html", "fantasy.html", "fantasy-draft.html", "fantasy-trade.html", "fantasy-ros.html", "fantasy-start-sit.html", "games/", "games/prospectle.html", "games/fantasle.html", "games/17-0.html", "games/blitz.html", "games/juke.html"]
    write("players/index.html", players_index())
    for p in players:
        write(f"players/{p['slug']}.html", player_page(p))
        paths.append(f"players/{p['slug']}.html")
    write("teams/index.html", teams_index())
    for team in team_names:
        write(f"teams/{slug(team)}.html", team_page(team))
        paths.append(f"teams/{slug(team)}.html")
    write("odds.html", odds_page())
    write("fantasy.html", fantasy_page())
    write("fantasy-draft.html", fantasy_draft_page())
    write("fantasy-trade.html", fantasy_trade_page())
    write("fantasy-ros.html", fantasy_ros_page())
    write("fantasy-start-sit.html", fantasy_startsit_page())
    games_pages()
    prospectle_page()
    fantasle_page()
    perfect_page()
    home_blocks()
    paths += nfl_profiles()
    sitemap(paths)
    print(f"Built {len(players)} player pages, {len(team_names)} team pages, the odds page, the games pages and sitemap.xml ({len(paths)} pages)")


if __name__ == "__main__":
    main()
