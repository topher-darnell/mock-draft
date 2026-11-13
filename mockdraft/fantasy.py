"""
Fantasy football numbers for the Fantasy page (docs/fantasy.html, built by build_pages.py).

Two parts:
  1. This season's leaders: fantasy_stats.csv (season totals, typed in from FFToday's stat pages)
     scored four ways: Standard, Half PPR, PPR and TE Premium.
  2. 2027 rookie rankings: the 2027 draft class at QB, RB, WR and TE, ranked for next season
     and for dynasty, using where they go in our 1,000 simulated drafts, their age and their
     college production.

Check the stats file after updating it:
    python3 fantasy.py
That prints every row whose points don't match FFToday's own Half-PPR total.
"""

import csv
import unicodedata
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS = [("std", "Standard"), ("half", "Half PPR"), ("ppr", "PPR"), ("tep", "TE Premium")]
PER_CATCH = {"std": 0, "half": 0.5, "ppr": 1, "tep": 1}
TE_BONUS = {"tep": 0.5}                       # TE Premium: an extra half point per tight end catch
STATS_AS_OF = "through Week 9 of the 2026 season"


def read(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if name == "fantasy_stats.csv":
        rows += missing_players({_key(r["name"]) for r in rows})
        teams = current_teams()
        for r in rows:
            r["team"] = teams.get(_key(r["name"]), r["team"])
    return rows


ADD_MIN_TOTAL = 15.0      # PPR points this season, or...
ADD_MIN_LAST = 6.0        # ...PPR points in the latest week (a rookie's debut, a new starter)


def missing_players(have):
    """
    fantasy_stats.csv is typed in from FFToday's leader pages, so it misses newer and smaller names
    (a rookie back from injury, a backup who just took over). Add anyone in the weekly stats who has
    scored enough to matter, with his season totals added up from those weeks.
    """
    path = os.path.join(HERE, "fantasy_weekly.csv")
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        weekly = list(csv.DictReader(fh))
    last = max(int(r["week"]) for r in weekly)
    sums = {}
    for r in weekly:
        k = _key(r["name"])
        if k in have or r["pos"] not in ("QB", "RB", "WR", "TE"):
            continue
        t = sums.setdefault(k, {"name": r["name"], "team": r["team"], "pos": r["pos"], "games": 0, "last": 0.0,
                                **{c: 0.0 for c in ("pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td")}})
        t["games"] += 1
        t["team"] = r["team"]
        for c in ("pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td"):
            t[c] += f(r[c])
        if int(r["week"]) == last:
            t["last"] = points(r, "ppr")
    out = []
    for t in sums.values():
        if points(t, "ppr") >= ADD_MIN_TOTAL or t["last"] >= ADD_MIN_LAST:
            row = {k: (str(int(v)) if isinstance(v, float) and v == int(v) else str(v)) for k, v in t.items() if k != "last"}
            row["fftoday_half"] = ""
            out.append(row)
    return out


def current_teams():
    """
    Each player's team right now: the official weekly roster (fantasy_status.csv, from nflverse), except
    for moves newer than that feed, which are in fantasy_teams.csv (name, team, date, source). That file
    wins. Players in neither keep the team in fantasy_stats.csv.
    """
    out = {}
    for fn, col in (("fantasy_status.csv", "team"), ("fantasy_teams.csv", "team")):
        path = os.path.join(HERE, fn)
        if os.path.exists(path):
            with open(path, newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    out[_key(r["name"])] = r[col]
    return out


def f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def points(r, fmt):
    pts = (f(r["pass_yds"]) * 0.04 + f(r["pass_td"]) * 4 - f(r["int"]) * 2
           + f(r["rush_yds"]) * 0.1 + f(r["rush_td"]) * 6
           + f(r["rec_yds"]) * 0.1 + f(r["rec_td"]) * 6
           + f(r["rec"]) * (PER_CATCH[fmt] + (TE_BONUS.get(fmt, 0) if r["pos"] == "TE" else 0)))
    return round(pts, 1)


def leaders():
    out = []
    for r in read("fantasy_stats.csv"):
        g = int(f(r["games"])) or 1
        out.append({
            "n": r["name"], "t": r["team"], "p": r["pos"], "g": g,
            "line": stat_line(r),
            "s": {k: points(r, k) for k, _ in FORMATS},
        })
    return out


def stat_line(r):
    """a short plain-English line of the main numbers"""
    bits = []
    if f(r["pass_yds"]):
        bits.append(f"{int(f(r['pass_yds'])):,} pass yds, {int(f(r['pass_td']))} TD, {int(f(r['int']))} INT")
    if f(r["rush_yds"]) or f(r["rush_td"]):
        if r["pos"] in ("QB", "RB") or f(r["rush_td"]):
            bits.append(f"{int(f(r['rush_yds'])):,} rush yds, {int(f(r['rush_td']))} TD")
    if f(r["rec"]):
        bits.append(f"{int(f(r['rec']))} catches, {int(f(r['rec_yds'])):,} yds, {int(f(r['rec_td']))} TD")
    return " · ".join(bits)


# ---------- 2027 rookies ----------

DYN_POS = {"WR": 1.0, "RB": 0.95, "TE": 0.8, "QB": 0.62}     # 1-QB leagues: receivers last longest
Y1_POS = {"RB": 1.0, "WR": 0.9, "TE": 0.55}                   # backs help fastest, tight ends slowest
FMT_POS = {                                                   # catches matter more in PPR
    "std": {"RB": 1.08, "WR": 0.92, "TE": 0.88},
    "half": {"RB": 1.04, "WR": 0.96, "TE": 0.94},
    "ppr": {},
    "tep": {"TE": 1.18},
}


def capital(pick):
    """how much a draft slot is worth: about 95 at #3, 52 at #30, 27 at #60, 11 at #100"""
    return 100 * math.exp(-(pick - 1) / 45)


def production(s, pos):
    games = f(s.get("games")) or 0
    if not games:
        return None
    if pos == "QB":
        v = f(s.get("pass_yds")) * 0.04 + f(s.get("pass_td")) * 4 + f(s.get("rush_yds")) * 0.1 + f(s.get("rush_td")) * 6
    elif pos == "RB":
        v = f(s.get("rush_yds")) + f(s.get("rec_yds")) + 60 * (f(s.get("rush_td")) + f(s.get("rec_td")))
    else:
        v = f(s.get("rec_yds")) + 60 * f(s.get("rec_td"))
    return v / games


def rookies():
    adp = {r["name"]: r for r in read("adp.csv")}
    ages = {r["name"]: r for r in read("prospect_ages.csv")}
    stats = {r["name"]: r for r in read("prospect_stats.csv")}
    pool = []
    for p in read("players.csv"):
        pos = p["position"]
        a = adp.get(p["name"])
        if pos not in DYN_POS or not a or f(a["drafted_pct"]) < 50:
            continue
        s = stats.get(p["name"], {})
        pool.append({"p": p, "a": a, "pos": pos, "age": f(ages.get(p["name"], {}).get("age_on_draft_day")) or None,
                     "s": s, "prod": production(s, pos)})

    best = {}
    for x in pool:
        if x["prod"] is not None:
            best[x["pos"]] = max(best.get(x["pos"], 0), x["prod"])

    out = []
    for x in pool:
        pos, pick = x["pos"], f(x["a"]["avg_pick"])
        cap = capital(pick)
        prod = x["prod"] / best[x["pos"]] if x["prod"] is not None and best.get(x["pos"]) else 0.4
        age_adj = max(-12, min(12, (22.0 - x["age"]) * 8)) if x["age"] else 0
        dyn = cap * DYN_POS[pos] + 15 * prod + age_adj
        if pos == "QB":
            y1 = cap * (0.5 if pick <= 20 else 0.25) + 10 * prod   # rookie QBs rarely start for 1-QB teams
        else:
            y1 = cap * Y1_POS[pos] + 10 * prod
        out.append({
            "n": x["p"]["name"], "p": pos, "c": x["p"]["college"], "pick": round(pick, 1),
            "team": x["a"]["top_team"], "tp": f(x["a"]["top_team_pct"]),
            "age": x["age"], "why": rookie_line(x),
            "y1": {k: round(y1 * FMT_POS[k].get(pos, 1), 2) for k, _ in FORMATS},
            "dyn": {k: round(dyn * FMT_POS[k].get(pos, 1), 2) for k, _ in FORMATS},
        })
    return out


def rookie_line(x):
    s, pos = x["s"], x["pos"]
    if not f(s.get("games")):
        return ""
    yr = s.get("season", "")
    if pos == "QB":
        return f"{yr}: {int(f(s['pass_yds'])):,} pass yds, {int(f(s['pass_td']))} TD"
    if pos == "RB":
        return f"{yr}: {int(f(s['rush_yds'])):,} rush yds, {int(f(s['rush_td']))} TD"
    return f"{yr}: {int(f(s['rec']))} catches, {int(f(s['rec_yds'])):,} yds, {int(f(s['rec_td']))} TD"


# ---------- Trending: who's heating up and cooling off ----------
# fantasy_weekly.csv has every player's stats game by game (from nflverse, see fetch_weekly.py).
# We compare the last TREND_WEEKS weeks with the weeks before them. Copies of fantasy_stats.csv
# are also kept in fantasy_history/ each Tuesday as a backup record of the season totals.

HISTORY = os.path.join(HERE, "fantasy_history")
TREND_WEEKS = 3          # compare the last 3 weeks to everything before them


def snapshots():
    out = []
    if os.path.isdir(HISTORY):
        for fn in sorted(os.listdir(HISTORY)):
            if fn.endswith(".csv") and "-w" in fn:
                week = int(fn.rsplit("-w", 1)[1][:-4])
                with open(os.path.join(HISTORY, fn), newline="", encoding="utf-8") as fh:
                    out.append((week, {r["name"]: r for r in csv.DictReader(fh)}))
    return sorted(out)


def _key(name):
    """match names across sources: 'A.J. Brown' = 'AJ Brown', 'Kenneth Walker III' = 'Kenneth Walker'"""
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()   # Estimé -> Estime
    n = n.lower().replace(".", "").replace("'", "").replace("-", " ")
    parts = [x for x in n.split() if x not in ("jr", "sr", "ii", "iii", "iv", "v")]
    return " ".join(parts)


def trends():
    """
    Per player: fantasy points per game in the last few weeks vs. the weeks before, plus targets and
    carries (his role). Uses fantasy_weekly.csv (nflverse, week by week; refresh with fetch_weekly.py).
    Only players on our fantasy list are included, with our spelling of their names.
    """
    path = os.path.join(HERE, "fantasy_weekly.csv")
    if not os.path.exists(path):
        return {"ready": False, "since": None}
    ours = {_key(r["name"]): r for r in read("fantasy_stats.csv")}
    games = {}
    for r in read("fantasy_weekly.csv"):
        me = ours.get(_key(r["name"]))
        if me:
            games.setdefault(me["name"], []).append(r)
    last = max(int(g["week"]) for gs in games.values() for g in gs)
    first_recent = last - TREND_WEEKS + 1
    keys = [k for k, _ in FORMATS]
    avg = lambda gs, fn: sum(fn(g) for g in gs) / len(gs) if gs else 0
    players = []
    for name, gs in games.items():
        me = ours[_key(name)]
        for g in gs:
            g["pos"] = me["pos"]
        now = [g for g in gs if int(g["week"]) >= first_recent]
        was = [g for g in gs if int(g["week"]) < first_recent]
        if not now:
            continue                          # didn't play lately (bye, injury): no trend
        players.append({
            "n": name, "t": me["team"], "p": me["pos"], "gw": len(now), "g0": len(was),
            "now": {k: round(avg(now, lambda g: points(g, k)), 1) for k in keys},
            "was": {k: round(avg(was, lambda g: points(g, k)), 1) for k in keys},
            "tgt": [round(avg(was, lambda g: f(g["tgt"])), 1), round(avg(now, lambda g: f(g["tgt"])), 1)],
            "car": [round(avg(was, lambda g: f(g["car"])), 1), round(avg(now, lambda g: f(g["car"])), 1)],
            "share": [round(100 * avg(was, lambda g: f(g["tgt_share"]))), round(100 * avg(now, lambda g: f(g["tgt_share"])))],
        })
    return {"ready": True, "from": first_recent, "to": last, "players": players}



# ---------- Injuries ----------
# fantasy_injuries.csv is our news-based list (updated every Tuesday): status out / ir / season /
# doubtful / questionable, and back_week = the first week he's expected to play again.
# fantasy_status.csv is the official roster (RES = injured reserve) and injury report from nflverse.
# The news list wins when both have a player.

IR_WEEKS = 4             # IR with no return date yet: assume he misses at least the next 4 weeks


def injuries(first_week):
    """{our player name: {"s": status, "back": week (0 = unknown, 99 = season), "inj": injury}}"""
    ours = {_key(r["name"]): r["name"] for r in read("fantasy_stats.csv")}
    out = {}
    if os.path.exists(os.path.join(HERE, "fantasy_status.csv")):
        for r in read("fantasy_status.csv"):
            name = ours.get(_key(r["name"]))
            if not name:
                continue
            rep = (r["report"] or "").lower()
            if r["roster"] == "RES":
                out[name] = {"s": "ir", "back": first_week + IR_WEEKS, "inj": r["injury"]}
            elif rep in ("out", "doubtful", "questionable"):
                out[name] = {"s": rep, "back": first_week + 1 if rep == "out" else 0, "inj": r["injury"]}
    if os.path.exists(os.path.join(HERE, "fantasy_injuries.csv")):
        for r in read("fantasy_injuries.csv"):
            name = ours.get(_key(r["name"]))
            if not name:
                continue
            st = r["status"]
            back = int(r["back_week"]) if r["back_week"] else (99 if st == "season" else first_week + IR_WEEKS if st == "ir" else first_week + 1 if st == "out" else 0)
            out[name] = {"s": st, "back": back, "inj": r["injury"], "src": r["source"], "date": r["date"]}
    return out


def availability(inj, week, first_week):
    """share of a normal game we expect from him that week: 0 if out, less if he's iffy this week"""
    if not inj:
        return 1.0
    if inj["back"] and week < inj["back"]:
        return 0.0
    if week == first_week and inj["s"] == "doubtful":
        return 0.25
    if week == first_week and inj["s"] == "questionable":
        return 0.85
    return 1.0



# ---------- Quarterback changes ----------
# fantasy_qbs.csv lists teams with a new starting QB (trade, injury, benching): team, qb, from_week.
# Receivers' points depend a lot on who throws to them. For those teams we compare the new QB's
# points per game with what the team's QBs scored per game all season (the QB play behind everyone's
# numbers so far) and move pass catchers halfway toward that change (running backs a fifth of the way).

QB_PULL = {"WR": 0.5, "TE": 0.5, "RB": 0.2, "QB": 0.0}


def qb_changes(weekly):
    """{team: {"qb", "from", "status", "mult": share of normal}} (mult is for a WR/TE)"""
    path = os.path.join(HERE, "fantasy_qbs.csv")
    if not os.path.exists(path):
        return {}
    team_games, qb_games = {}, {}
    for r in weekly:
        if r["pos"] != "QB":
            continue
        key = (r["team"], r["week"])
        team_games[key] = team_games.get(key, 0) + points(r, "ppr")
        qb_games.setdefault(_key(r["name"]), []).append(points(r, "ppr"))
    starters = sorted((v for v in (sum(g) / len(g) for g in qb_games.values() if len(g) >= 4)), reverse=True)
    fill_in = starters[min(len(starters) - 1, 23)]          # a QB24-level starter, for QBs with few games
    out = {}
    for r in read("fantasy_qbs.csv"):
        t = r["team"]
        games = [v for (tm, w), v in team_games.items() if tm == t]
        old = sum(games) / len(games) if games else fill_in
        mine = qb_games.get(_key(r["qb"]), [])
        new = sum(mine) / len(mine) if len(mine) >= 3 else fill_in
        out[t] = {"qb": r["qb"], "from": int(r["from_week"]), "status": r["status"],
                  "change": round(new / max(1, old) - 1, 3)}
    return out


def qb_mult(change, pos):
    return round(max(0.85, min(1.15, 1 + QB_PULL.get(pos, 0) * change)), 3)


# ---------- Rest of season: projections with matchups and playoff schedules ----------
# Every defense gets a matchup number per position: fantasy points it allows per game compared
# with an average defense (1.10 = gives up 10% more). A player's projection for each remaining
# week is his points per game times that week's matchup (0 on his bye). Fantasy playoffs: Weeks 15-17.

LAST_FANTASY_WEEK = 17
PLAYOFF_WEEKS = (15, 16, 17)


def schedule():
    games = {}
    for g in read("fantasy_schedule.csv"):
        w = int(g["week"])
        games.setdefault(g["away"], {})[w] = g["home"]
        games.setdefault(g["home"], {})[w] = g["away"]
    return games


def matchups(weekly):
    """{pos: {defense: factor}} from fantasy points allowed per game (PPR), steadied toward 1.0"""
    allowed = {}                                            # (pos, defense, week) -> points
    for r in weekly:
        key = (r["pos"], r["opp"], int(r["week"]))
        allowed[key] = allowed.get(key, 0) + points(r, "ppr")
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        per = {}
        for (p, d, w), pts in allowed.items():
            if p == pos:
                per.setdefault(d, []).append(pts)
        avg = sum(sum(v) / len(v) for v in per.values()) / len(per)
        out[pos] = {}
        for d, v in per.items():
            raw = (sum(v) / len(v)) / avg
            steady = 1 + (raw - 1) * len(v) / (len(v) + 3)   # few games: trust it less
            out[pos][d] = round(max(0.75, min(1.25, steady)), 3)
    return out


def rest_of_season():
    if not os.path.exists(os.path.join(HERE, "fantasy_schedule.csv")):
        return None
    weekly = read("fantasy_weekly.csv")
    last = max(int(r["week"]) for r in weekly)
    weeks = list(range(last + 1, LAST_FANTASY_WEEK + 1))
    games = schedule()
    fac = matchups(weekly)
    keys = [k for k, _ in FORMATS]
    ours = {_key(r["name"]): r for r in read("fantasy_stats.csv")}
    by_player = {}
    for r in weekly:
        me = ours.get(_key(r["name"]))
        if me:
            r["pos"] = me["pos"]
            by_player.setdefault(me["name"], []).append(r)
    team_weeks = {}                                         # weeks each offense has played
    for r in weekly:
        team_weeks.setdefault(r["team"], set()).add(int(r["week"]))

    # a typical starter's points per game, to steady players with few games
    base = {}
    for pos in ("QB", "RB", "WR", "TE"):
        grp = sorted((points(m, "ppr") / f(m["games"]) for m in ours.values() if m["pos"] == pos and f(m["games"]) >= 4), reverse=True)
        base[pos] = grp[min(len(grp) - 1, {"QB": 15, "RB": 30, "WR": 40, "TE": 15}[pos])]

    hurt = injuries(weeks[0])
    for r in weekly:                                        # positions for the QB math
        me = ours.get(_key(r["name"]))
        r["pos"] = me["pos"] if me else r["pos"]
    qbs = qb_changes(weekly)
    players = []
    for me in ours.values():
        g = f(me["games"])
        if g < 1:
            continue
        inj = hurt.get(me["name"])
        pos, team = me["pos"], me["team"]
        gs = by_player.get(me["name"], [])
        recent = [x for x in gs if int(x["week"]) > last - 3]
        ppg = {}
        for k in keys:
            ratio = points(me, k) / max(0.1, points(me, "ppr")) if points(me, "ppr") > 0 else 1
            season = (points(me, k) + 2 * base[pos] * ratio) / (g + 2)
            if len(recent) >= 2:
                season = 0.65 * season + 0.35 * sum(points(x, k) for x in recent) / len(recent)
            ppg[k] = season
        sched = []
        for w in weeks:
            opp = games.get(team, {}).get(w, "")
            qb = qbs.get(team)
            qm = qb_mult(qb["change"], pos) if qb and w >= qb["from"] and me["name"] != qb["qb"] else 1.0
            sched.append([w, opp, fac[pos].get(opp, 1.0) if opp else 0, availability(inj, w, weeks[0]), qm])
        po = [m for w, _, m, _a, _q in sched if w in PLAYOFF_WEEKS]
        played = sorted(int(x["week"]) for x in gs)
        wk = [points(x, "ppr") for x in gs]
        if len(wk) >= 3:                                    # how much his week-to-week scoring swings
            mean = sum(wk) / len(wk)
            sd = (sum((v - mean) ** 2 for v in wk) / (len(wk) - 1)) ** 0.5
        else:
            sd = 0.4 * ppg["ppr"]
        missed = len([w for w in team_weeks.get(team, set()) if not played or w > played[-1]])
        rec = sum(points(x, "ppr") for x in recent) / len(recent) if recent else 0
        players.append({
            "n": me["name"], "t": team, "p": pos, "g": int(g), "rec": rec, "_ppg": ppg,
            "ppg": {k: round(v, 1) for k, v in ppg.items()}, "sched": sched,
            "po": round(sum(po) / len(po), 3) if po and all(po) else round(sum(po) / max(1, len(po)), 3),
            "sd": round(sd / max(0.1, ppg["ppr"]), 2),             # swing as a share of his PPR average
            "out": played[-1] if gs and missed >= 2 else 0,            # last week played, if he's missed 2+ games since
            "inj": {k: inj[k] for k in ("s", "back", "inj") if k in inj} if inj else None,
            "qb": {"name": qbs[team]["qb"], "status": qbs[team]["status"], "m": qb_mult(qbs[team]["change"], pos)}
                  if team in qbs and pos != "QB" and qb_mult(qbs[team]["change"], pos) != 1 else None,
        })
    fill_ins(players)
    for p in players:
        p["ros"] = {k: round(sum(p["_ppg"][k] * m * a * q for _, _, m, a, q in p["sched"]), 1) for k in keys}
        del p["_ppg"], p["rec"]
    return {"from": weeks[0], "to": weeks[-1], "playoffs": list(PLAYOFF_WEEKS), "players": players,
            "fac": fac, "sched": {t: {str(w): o for w, o in v.items() if w in weeks} for t, v in games.items()}}



# ---------- Fill-ins: more work when a teammate is hurt ----------
# When a player who's been part of his offense lately (played in the last 3 weeks) is out, his usual
# points don't vanish: most go to teammates. We hand them out to healthy teammates who've played lately,
# by position (a running back's work mostly to the other backs, a receiver's to receivers and tight
# ends), in proportion to what each has been scoring, at 75% efficiency (backups are usually less
# effective). Players hurt before the last 3 weeks are skipped: their teammates' recent numbers
# already show the bigger role. The boost rides in the same weekly multiplier as the QB change.

FILL_TO = {"RB": {"RB": 0.85, "WR": 0.10, "TE": 0.05}, "WR": {"WR": 0.70, "TE": 0.20, "RB": 0.10},
           "TE": {"TE": 0.55, "WR": 0.45}}
FILL_EFF = 0.75
FILL_FLOOR = 3.0           # everyone counts as at least this many points a game when splitting
FILL_MAX = 2.5             # a fill-in can at most triple his usual projection


def fill_ins(players):
    by_team = {}
    for p in players:
        by_team.setdefault(p["t"], []).append(p)
    for team, roster in by_team.items():
        for i, w in enumerate(p0[0] for p0 in roster[0]["sched"]):
            gone = [p for p in roster if p["p"] in FILL_TO and p["rec"] > 0 and p["sched"][i][3] < 1]
            if not gone:
                continue
            add = {}
            for g in gone:
                vac = g["_ppg"]["ppr"] * g["sched"][i][4] * (1 - g["sched"][i][3]) * FILL_EFF
                for pos, share in FILL_TO[g["p"]].items():
                    mates = [p for p in roster if p["p"] == pos and p is not g and p["rec"] > 0 and p["sched"][i][3] >= 1]
                    tot = sum(max(FILL_FLOOR, p["rec"]) for p in mates)
                    for p in mates:
                        add.setdefault(id(p), [p, 0, []])
                        add[id(p)][1] += vac * share * max(FILL_FLOOR, p["rec"]) / tot
                        if g["n"] not in add[id(p)][2] and pos == g["p"]:
                            add[id(p)][2].append(g["n"])
            for p, pts, names in add.values():
                base = p["_ppg"]["ppr"] * p["sched"][i][4]
                if base <= 0 or pts < 0.3:
                    continue
                mult = min(FILL_MAX, 1 + pts / base)
                p["sched"][i][4] = round(p["sched"][i][4] * mult, 3)
                if names and mult >= 1.08:
                    p.setdefault("fill", {})[w] = {"for": names, "m": round(mult, 2)}


# ---------- Scores ----------
# Final scores from the schedule, each team's top fantasy scorers from the weekly stats (or, for the week
# still being played, fantasy_live.csv, which never feeds the projections).

def _stat_line(r):
    n = lambda c: int(f(r.get(c, 0)))
    bits = []
    if r["pos"] == "QB":
        bits.append(f"{n('cmp')}/{n('att')}, {n('pass_yds')} yds")
        if n("pass_td"):
            bits.append(f"{n('pass_td')} TD")
        if n("int"):
            bits.append(f"{n('int')} INT")
        if n("rush_yds") >= 15 or n("rush_td"):
            bits.append(f"{n('rush_yds')} rush yds" + (f", {n('rush_td')} rush TD" if n("rush_td") else ""))
        return ", ".join(bits)
    if r["pos"] == "RB" and n("car"):
        bits.append(f"{n('car')} carries, {n('rush_yds')} yds" + (f", {n('rush_td')} TD" if n("rush_td") else ""))
    if n("rec") or (r["pos"] != "RB" and n("tgt")):
        bits.append(f"{n('rec')} catch{'es' if n('rec') != 1 else ''}, {n('rec_yds')} yds" + (f", {n('rec_td')} TD" if n("rec_td") else ""))
    if r["pos"] != "RB" and (n("rush_yds") >= 10 or n("rush_td")):
        bits.append(f"{n('rush_yds')} rush yds" + (f", {n('rush_td')} TD" if n("rush_td") else ""))
    return "; ".join(bits)


def scores(week=None, per_team=3):
    sched = read("fantasy_schedule.csv")
    if not sched or "away_score" not in sched[0]:
        return None
    played = [g for g in sched if g["away_score"] != ""]
    if week is None:
        if not played:
            return None
        week = max(int(g["week"]) for g in played)
    stats = [r for r in read("fantasy_weekly.csv") if int(r["week"]) == week]
    if not stats and os.path.exists(os.path.join(HERE, "fantasy_live.csv")):
        stats = [r for r in read("fantasy_live.csv") if int(r["week"]) == week]
    games = []
    for g in sched:
        if int(g["week"]) != week:
            continue
        game = {"away": g["away"], "home": g["home"], "day": g["day"], "time": g.get("time", ""), "final": g["away_score"] != ""}
        if game["final"]:
            game["score"] = [int(g["away_score"]), int(g["home_score"])]
            for side in ("away", "home"):
                mine = [r for r in stats if r["team"] == g[side] and r["opp"] == g["home" if side == "away" else "away"]]
                every = [{"n": r["name"], "p": r["pos"], "pts": round(points(r, "ppr"), 1), "line": _stat_line(r)}
                         for r in sorted(mine, key=lambda r: -points(r, "ppr")) if points(r, "ppr") != 0]
                game[side + "_top"] = [r for r in every if r["pts"] > 0][:per_team]
                game[side + "_all"] = every
        games.append(game)
    games.sort(key=lambda g: (g["day"], g["time"]))
    return {"week": week, "games": games, "done": all(g["final"] for g in games)}


def week_points(week):
    """actual fantasy points for everyone who has played in `week` so far: {name: [std, half, ppr, stat line]},
    plus the teams whose game is final (a player on one of those teams with no stats didn't play)"""
    sched = read("fantasy_schedule.csv")
    final = {g[side] for g in sched if int(g["week"]) == week and g.get("away_score", "") != "" for side in ("away", "home")}
    rows = [r for r in read("fantasy_weekly.csv") if int(r["week"]) == week]
    if not rows and os.path.exists(os.path.join(HERE, "fantasy_live.csv")):
        rows = [r for r in read("fantasy_live.csv") if int(r["week"]) == week]
    pts = {r["name"]: [round(points(r, k), 1) for k in ("std", "half", "ppr")] + [_stat_line(r)] for r in rows}
    return pts, final


# ---------- Waiver wire ----------
# Players who are probably still on waivers in a 12-team league (not among the top scorers at their
# position this season, and not a regular starter by points per game) whose next few weeks look good:
# a bigger role, a teammate out, a hot streak, an easy schedule. Ranked by projected PPR points over
# the next WAIVER_WEEKS weeks. Same projections as everything else on the site.

WAIVER_WEEKS = 3
WAIVER_WT = (0.5, 0.3, 0.2)                                 # this week, next week, the week after
LIKELY_ROSTERED = {"QB": 16, "RB": 36, "WR": 48, "TE": 14}   # season PPR total rank at or above this: rostered
STARTER_PPG = {"QB": 12, "RB": 24, "WR": 30, "TE": 10}       # ...and so is anyone this high in points per game
ADD_NOW = {"QB": 16.0, "RB": 10.0, "WR": 10.0, "TE": 7.5}    # next-weeks average worth a claim right away
WAIVER_SHOW = {"QB": 3, "RB": 8, "WR": 10, "TE": 4}


def waiver_wire():
    ros = rest_of_season()
    if not ros:
        return None
    trend = trends()
    hot = {r["n"]: r for r in trend["players"]} if trend["ready"] else {}
    lead = {r["n"]: r for r in leaders()}
    week = ros["from"]
    soon = list(range(week, min(ros["to"], week + WAIVER_WEEKS - 1) + 1))
    total_rank, ppg_rank = {}, {}
    for pos in ("QB", "RB", "WR", "TE"):
        grp = [r for r in lead.values() if r["p"] == pos]
        for i, r in enumerate(sorted(grp, key=lambda r: -r["s"]["ppr"]), 1):
            total_rank[r["n"]] = i
        for i, r in enumerate(sorted([r for r in grp if r["g"] >= 2], key=lambda r: -r["s"]["ppr"] / r["g"]), 1):
            ppg_rank[r["n"]] = i
    # last season's starters are still on rosters even after a slow start
    last_year = {}
    if os.path.exists(os.path.join(HERE, "fantasy_seasons.csv")):
        rows = read("fantasy_seasons.csv")
        yr = max(int(r["season"]) for r in rows)
        for pos in ("QB", "RB", "WR", "TE"):
            grp = [r for r in rows if r["pos"] == pos and int(r["season"]) == yr and int(r["games"]) >= 8]
            for i, r in enumerate(sorted(grp, key=lambda r: -f(r["ppr"]) / int(r["games"])), 1):
                last_year[_key(r["name"])] = i
    out = {pos: [] for pos in ("QB", "RB", "WR", "TE")}
    for p in ros["players"]:
        pos, n = p["p"], p["n"]
        if (total_rank.get(n, 999) <= LIKELY_ROSTERED[pos] or ppg_rank.get(n, 999) <= STARTER_PPG[pos]
                or last_year.get(_key(n), 999) <= STARTER_PPG[pos]):
            continue
        if p["out"] or (p.get("inj") and p["inj"]["s"] in ("ir", "season", "out")):
            continue
        weeks = [x for x in p["sched"] if x[0] in soon]
        proj = [p["ppg"]["ppr"] * m * a * q for w, opp, m, a, q in weeks]
        games = [(v, WAIVER_WT[i]) for i, ((w, opp, m, a, q), v) in enumerate(zip(weeks, proj)) if opp]
        if not games:
            continue
        avg = sum(v * wt for v, wt in games) / sum(wt for v, wt in games)   # this week counts most
        why = []
        fill = p.get("fill") or {}
        games_in = {x[0] for x in weeks if x[1]}
        fw = sorted(w for w in fill if w in soon and w in games_in)
        if fw:
            names = " and ".join(fill[fw[0]]["for"])
            span = f"Week {fw[0]}" if len(fw) == 1 else f"Weeks {fw[0]}–{fw[-1]}"
            why.append(f"More work: {names} {'are' if len(fill[fw[0]]['for']) > 1 else 'is'} out ({span}).")
        t = hot.get(n)
        if t and t["gw"] >= 2 and t["g0"] >= 2:
            d = t["now"]["ppr"] - t["was"]["ppr"]
            if d >= 3:
                why.append(f"Heating up: {t['now']['ppr']:.1f} PPR points a game over his last {t['gw']} games, up from {t['was']['ppr']:.1f}.")
            touch = lambda i: t["tgt"][i] + (t["car"][i] if pos == "RB" else 0)
            if pos != "QB" and touch(1) - touch(0) >= 2:
                why.append(f"Bigger role: {touch(1):.1f} {'touches' if pos == 'RB' else 'targets'} a game lately, up from {touch(0):.1f}.")
        if p["g"] <= 2:
            why.append(f"Just getting started: {p['g']} game{'s' if p['g'] > 1 else ''} played so far.")
        if p.get("qb") and p["qb"]["m"] > 1:
            why.append(f"New quarterback: {p['qb']['name']} is an upgrade for him.")
        ms = [m for w, opp, m, a, q in weeks if opp]
        if ms and sum(ms) / len(ms) >= 1.05:
            opps = ", ".join(TEAM_NAME.get(opp, opp) for w, opp, m, a, q in weeks if opp)
            why.append(f"Soft schedule next: {opps}.")
        if p["po"] >= 1.06:
            why.append("Playoff schedule: easy matchups in Weeks 15–17.")
        if not why:
            why.append(f"Steady: {p['ppg']['ppr']:.1f} PPR points a game this season.")
        out[pos].append({"n": n, "t": p["t"], "p": pos, "g": p["g"], "ppg": p["ppg"]["ppr"], "avg": round(avg, 1),
                         "next": [[w, opp, round(v, 1)] for (w, opp, m, a, q), v in zip(weeks, proj)],
                         "rank": total_rank.get(n), "add": avg >= ADD_NOW[pos], "why": why[:3]})
    for pos in out:
        out[pos] = sorted(out[pos], key=lambda r: -r["avg"])[:WAIVER_SHOW[pos]]
    return {"week": week, "soon": soon, "pos": out}


# ---------- Weekly Start 'Em / Sit 'Em ----------
# Built every Tuesday from the same numbers as the start/sit tool (PPR). Starts: borderline players
# whose projection this week beats their usual average. Sits: players people usually start who face a
# tough week. fantasy_picks.csv (week, name, call, reason) can add or override picks by hand.

START_POOL = {"QB": (8, 24), "RB": (10, 40), "WR": (12, 45), "TE": (5, 18)}   # season PPG ranks to pick starts from
SIT_POOL = {"QB": (6, 16), "RB": (8, 30), "WR": (10, 36), "TE": (4, 12)}       # ...and sits: usual starters, not studs
POS_WORD = {"QB": "quarterbacks", "RB": "running backs", "WR": "receivers", "TE": "tight ends"}
TEAM_NAME = {"ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
             "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
             "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LV": "Raiders", "LAC": "Chargers",
             "LAR": "Rams", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
             "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SF": "49ers", "SEA": "Seahawks", "TB": "Buccaneers",
             "TEN": "Titans", "WAS": "Commanders"}


def weekly_picks(per_pos=2):
    ros = rest_of_season()
    trend = trends()
    hot = {r["n"]: r for r in trend["players"]} if trend["ready"] else {}
    week = ros["from"]
    rows = []
    for r in ros["players"]:
        w, opp, m, a, q = r["sched"][0]
        if not opp or a == 0 or r["out"] or r["g"] < 4:
            continue                                         # bye, out, or not playing lately
        t = hot.get(r["n"])
        rows.append(dict(r, opp=opp, m=m, a=a, q=q, proj=r["ppg"]["ppr"] * m * a * q, avg=r["ppg"]["ppr"], tr=t))
    for pos in POS_WORD:                                     # season PPG rank within position
        for i, r in enumerate(sorted((x for x in rows if x["p"] == pos), key=lambda x: -x["avg"]), 1):
            r["rank"] = i

    def reasons(r, call):
        out = []
        fl = (r.get("fill") or {}).get(week)
        if call == "start" and fl:
            names = " and ".join(fl["for"])
            out.append(f"More work: {names} {'are' if len(fl['for']) > 1 else 'is'} out this week.")
        pct = round(abs(r["m"] - 1) * 100)
        foe = TEAM_NAME.get(r["opp"], r["opp"])
        if call == "start" and r["m"] >= 1.05:
            out.append(f"Good matchup: the {foe} give up {pct}% more fantasy points to {POS_WORD[r['p']]} than an average defense.")
        if call == "sit" and r["m"] <= 0.95:
            out.append(f"Tough matchup: the {foe} allow {pct}% fewer fantasy points to {POS_WORD[r['p']]} than an average defense.")
        t = r["tr"]
        if t and t["g0"] >= 2 and t["gw"] >= 2:
            d = t["now"]["ppr"] - t["was"]["ppr"]
            if call == "start" and d >= 3:
                out.append(f"Heating up: {t['now']['ppr']:.1f} PPR points a game over his last {t['gw']} games, up from {t['was']['ppr']:.1f}.")
            if call == "sit" and d <= -3:
                out.append(f"Cooling off: {t['now']['ppr']:.1f} PPR points a game over his last {t['gw']} games, down from {t['was']['ppr']:.1f}.")
            touch = lambda i: t["tgt"][i] + (t["car"][i] if r["p"] == "RB" else 0)
            if r["p"] != "QB" and call == "start" and touch(1) - touch(0) >= 3:
                out.append(f"More work lately: {touch(1):.1f} {'touches' if r['p'] == 'RB' else 'targets'} a game, up from {touch(0):.1f}.")
            if r["p"] != "QB" and call == "sit" and touch(0) - touch(1) >= 3:
                out.append(f"Less work lately: {touch(1):.1f} {'touches' if r['p'] == 'RB' else 'targets'} a game, down from {touch(0):.1f}.")
        if r.get("qb") and ((call == "start" and r["qb"]["m"] > 1) or (call == "sit" and r["qb"]["m"] < 1)):
            out.append(f"New quarterback: {r['qb']['name']}{' (expected)' if r['qb']['status'] == 'expected' else ''} is "
                       f"{'an upgrade' if r['qb']['m'] > 1 else 'a step down'} for him.")
        if call == "sit" and r.get("inj") and r["inj"]["s"] in ("questionable", "doubtful"):
            out.append(f"Banged up: {r['inj']['s']} this week" + (f" ({r['inj']['inj'].split(' (')[0].lower()})." if r["inj"].get("inj") else "."))
        return out[:3]

    def form(r):
        t = r["tr"]
        return t["now"]["ppr"] - t["was"]["ppr"] if t and t["g0"] >= 2 and t["gw"] >= 2 else 0

    def touches(r, i):
        t = r["tr"]
        return t["tgt"][i] + (t["car"][i] if r["p"] == "RB" else 0) if t and t["g0"] >= 2 and t["gw"] >= 2 else None

    def ok_start(r):
        if r["p"] != "QB" and touches(r, 0) and touches(r, 1) < 0.7 * touches(r, 0):
            return False     # lost a big part of his role
        return form(r) > -3 or (r.get("qb") and r["qb"]["m"] > 1)   # cooling off hard? only with a new QB

    def ok_sit(r):       # never bench a guy who's on fire
        return form(r) < 3

    picks = {"start": {}, "sit": {}}
    for pos in POS_WORD:
        lo, hi = START_POOL[pos]
        pool = [r for r in rows if r["p"] == pos and lo <= r["rank"] <= hi]
        cands = sorted(pool, key=lambda r: -(r["proj"] / r["avg"] - 1))
        picks["start"][pos] = [r for r in cands if r["proj"] / r["avg"] >= 1.06 and ok_start(r) and reasons(r, "start")][:per_pos]
        lo, hi = SIT_POOL[pos]
        pool = [r for r in rows if r["p"] == pos and lo <= r["rank"] <= hi]
        cands = sorted(pool, key=lambda r: (r["proj"] / r["avg"] - 1))
        picks["sit"][pos] = [r for r in cands if r["proj"] / r["avg"] <= 0.92 and ok_sit(r) and reasons(r, "sit")][:per_pos]

    # hand-picked additions or overrides for this week
    if os.path.exists(os.path.join(HERE, "fantasy_picks.csv")):
        byname = {_key(r["n"]): r for r in rows}
        for h in read("fantasy_picks.csv"):
            r = byname.get(_key(h["name"]))
            if not r or int(h["week"]) != week or h["call"] not in ("start", "sit"):
                continue
            for c in ("start", "sit"):
                picks[c][r["p"]] = [x for x in picks[c][r["p"]] if x["n"] != r["n"]]
            picks[h["call"]][r["p"]].insert(0, dict(r, mine=h["reason"]))

    out = {"week": week, "start": {}, "sit": {}}
    for c in ("start", "sit"):
        for pos, lst in picks[c].items():
            out[c][pos] = [{"n": r["n"], "t": r["t"], "p": pos, "opp": r["opp"], "m": r["m"], "proj": round(r["proj"], 1),
                            "avg": round(r["avg"], 1), "why": [r["mine"]] if r.get("mine") else reasons(r, c)} for r in lst]
    return out


if __name__ == "__main__":
    bad = 0
    rows = read("fantasy_stats.csv")
    for r in rows:
        calc = (f(r["pass_yds"]) * 0.04 + f(r["pass_td"]) * 4 + f(r["rush_yds"]) * 0.1 + f(r["rush_td"]) * 6
                + f(r["rec_yds"]) * 0.1 + f(r["rec_td"]) * 6 + f(r["rec"]) * 0.5)   # FFToday: no INT penalty
        if r.get("fftoday_half") and abs(calc - f(r["fftoday_half"])) > 0.15:
            bad += 1
            print(f"check {r['name']}: our {calc:.1f} vs FFToday {r['fftoday_half']}")
    print(f"{len(rows)} players, {bad} to check")
    for fmt, label in FORMATS:
        top = sorted(leaders(), key=lambda x: -x["s"][fmt])[:3]
        rk = sorted(rookies(), key=lambda x: -x["dyn"][fmt])[:3]
        print(label, "leaders:", ", ".join(f"{x['n']} {x['s'][fmt]}" for x in top), "| dynasty:", ", ".join(x["n"] for x in rk))
