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

import fantasy

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, "..", "docs"))
SITE = "https://bigheadgm.com/"
DRAFT_DATE = "April 29, 2027"
CSS_V, GM_V, SITE_JS_V = "11", "5", "1"       # bump with the files in index.html
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

NAV = [("", "Mock draft"), ("players/", "Big board"), ("teams/", "Teams"), ("odds.html", "#1 pick odds"),
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
    name, pos, share = s["top"][0]
    others = " · ".join(f"{player_link(n, root)} {pct(v)}" for n, _, v in s["top"][1:])
    college = by_name[name]["college"] if name in by_name else ""
    lead = gm_tag(s["team"], "happy" if share >= 40 else "focused", 40) if show_team else ""
    top = esc(short(s["team"])) if show_team else f"Round {s['round']}"
    return f"""<li class="in-pick">
        <span class="in-pick-no">{s['pick']}</span>{lead}
        <span class="in-pick-text">
          <span class="in-pick-team">{top}</span>
          <span class="in-pick-name">{player_link(name, root)}</span>
          <span class="in-pick-meta">{pos} · {esc(college)}</span>
          {f'<span class="in-pick-alt">Also: {others}</span>' if others else ''}
        </span>
        <span class="in-pick-pct" title="Taken here in {pct(share)} of drafts">{pct(share)}</span>
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
      <h2 class="home-h2">Most likely pick at each slot</h2>
      <p class="in-note">The player the {esc(sh)} took most often at each of their picks, across {SIMS} simulated drafts.</p>
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
                crumbs=[("Teams", "teams/"), (team, f"teams/{slug(team)}.html")], nav="teams/",
                og_title=f"{team} 2027 mock draft")


def teams_index():
    cards = ""
    for team in team_names:
        picks = [o for o in order if o["team"] == team]
        firsts = ", ".join(f"#{o['pick']}" for o in picks if o["round"] == 1) or "No 1st"
        sh = short(team)
        cards += (f'<a class="home-team" href="{slug(team)}.html" aria-label="{esc(team)} mock draft">'
                  f'{gm_tag(team, "neutral", 60)}'
                  f'<span class="home-team-name{" long" if len(sh) > 9 else ""}">{esc(sh)}</span>'
                  f'<span class="home-team-picks">{firsts}</span></a>')
    body = f"""
    <p class="eyebrow">2027 NFL MOCK DRAFT</p>
    <h1 class="in-title">Team mock drafts</h1>
    <p class="in-sub">Pick a team to see its needs, every pick it holds, and who it takes most often in {SIMS} simulated drafts.</p>
    <div class="home-teams pg-teams">{cards}</div>

    <section class="pg-section">
      <h2 class="home-h2">Round 1, pick by pick</h2>
      <p class="in-note">The most common pick at each first-round slot.</p>
      <ol class="in-mock">{''.join(pick_row(s, "../", True) for s in sims['slots'] if s['round'] == 1)}</ol>
    </section>"""
    return page("teams/index.html", "2027 NFL Mock Draft for All 32 Teams · Big Head GM",
                f"A 2027 NFL mock draft page for every team: needs, picks and the most likely selections from {SIMS} simulated drafts.",
                body, crumbs=[("Teams", "teams/")], nav="teams/")


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
        f'<tr><td class="ff-rk">{i}</td><th scope="row">{esc(r["n"])}<span>{r["p"]} · {esc(FF_TEAM.get(r["t"], r["t"]))} · {esc(r["line"])}</span></th>'
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


def fantasy_page():
    lead = fantasy.leaders()
    rook = fantasy.rookies()
    data = json.dumps({"leaders": lead, "rookies": [
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

    <nav class="ff-jump" aria-label="On this page">
      <a href="#leaders">2026 leaders</a><a href="#next-year">Rookies for next season</a><a href="#dynasty">Dynasty rookies</a>
    </nav>

    <div class="ff-bar">
      <p class="ff-label">Your scoring</p>
      <div class="in-chips ff-fmt" id="ff-fmt" aria-label="Scoring">{fmt_btns}</div>
    </div>

    <section class="pg-section" id="leaders">
      <h2 class="home-h2">Who's leading in 2026</h2>
      <p class="in-note">Season totals {fantasy.STATS_AS_OF}. Tap a position to see just that group.</p>
      <div class="in-chips bb-chips" id="ff-pos" aria-label="Position">{pos_btns}</div>
      <div class="od-wrap">
        <table class="od-table ff-table">
          <thead><tr><th scope="col" class="ff-rk">#</th><th scope="col">Player</th><th scope="col">G</th><th scope="col">Pts</th><th scope="col">Per game</th></tr></thead>
          <tbody id="ff-lead">{ff_leader_rows(lead, "ppr")}</tbody>
        </table>
      </div>
    </section>

    <section class="pg-section" id="next-year">
      <h2 class="home-h2">Best 2027 rookies for next season</h2>
      <p class="in-note">Who should help a fantasy team the most as a rookie in 2027. Backs and receivers drafted early get the biggest boost; rookie quarterbacks and tight ends usually take time.</p>
      <ol class="bb-list ff-list" id="ff-y1">{ff_rookie_rows(rook, "y1", "ppr")}</ol>
    </section>

    <section class="pg-section" id="dynasty">
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
                body, crumbs=[("Fantasy", "fantasy.html")], nav="fantasy.html", scripts=("fantasy.js?v=1",))


# ---------- games ----------

def games_pages():
    hub = f"""
    <p class="eyebrow">BIG HEAD GM GAMES</p>
    <h1 class="in-title">Games</h1>
    <p class="in-sub">Quick games for when you're not on the clock. Free, no sign-up, and they work on your phone.</p>
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
    write("games/index.html", page("games/index.html", "Free Football Games: Draft Day Blitz and Juke · Big Head GM",
          "Two quick, free football games from Big Head GM: Draft Day Blitz, a daily swipe-to-draft challenge, and Juke, an endless runner through 32 big-headed GMs.",
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


# ---------- sitemap ----------

def sitemap(paths):
    day = TODAY.isoformat()
    urls = "".join(f"  <url><loc>{SITE}{p}</loc><lastmod>{day}</lastmod></url>\n" for p in paths)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n")


def main():
    paths = ["", "players/", "teams/", "odds.html", "insights.html", "fantasy.html", "games/", "games/blitz.html", "games/juke.html"]
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
    games_pages()
    sitemap(paths)
    print(f"Built {len(players)} player pages, {len(team_names)} team pages, the odds page, the games pages and sitemap.xml ({len(paths)} pages)")


if __name__ == "__main__":
    main()
