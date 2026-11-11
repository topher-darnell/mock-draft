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
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS = [("std", "Standard"), ("half", "Half PPR"), ("ppr", "PPR"), ("tep", "TE Premium")]
PER_CATCH = {"std": 0, "half": 0.5, "ppr": 1, "tep": 1}
TE_BONUS = {"tep": 0.5}                       # TE Premium: an extra half point per tight end catch
STATS_AS_OF = "through Week 10 of the 2026 season"


def read(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


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
    n = name.lower().replace(".", "").replace("'", "").replace("-", " ")
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
