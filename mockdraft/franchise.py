"""Franchise mode data: every active NFL player with a 50-99 rating.

    python3 franchise.py              # download the newest nflverse files, write docs/games/franchise-data.json
    python3 franchise.py --cached     # reuse the files already downloaded (in /tmp/bhg-franchise)

Source: nflverse (free, public): the 2026 roster, weekly player stats and snap counts.
Ratings are rank-based within each position group:
  - how much he plays (share of his team's snaps, over the games so far)
  - what he does when he plays (yards and TDs for offense; sacks, pressures, tackles,
    passes defended and picks for defense). Offensive linemen are rated on snaps alone.
Players who haven't played this season get a backup-level rating (45-60).
No photos: the roster file has headshot links, and we never use them.
"""
import csv
import json
import math
import os
import sys
import urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "games", "franchise-data.json")
CACHE = "/tmp/bhg-franchise"
SEASON = 2026
BASE = "https://github.com/nflverse/nflverse-data/releases/download/"
FILES = {
    "roster.csv": f"rosters/roster_{SEASON}.csv",
    "stats.csv": f"stats_player/stats_player_week_{SEASON}.csv",
    "snaps.csv": f"snap_counts/snap_counts_{SEASON}.csv",
}
TEAM = {"LA": "LAR"}            # nflverse code -> the site's code

# the 22 starters: 11 on offense, 11 on defense (nickel)
SLOTS = {"QB": 1, "RB": 1, "WR": 3, "TE": 1, "OT": 2, "IOL": 3,
         "EDGE": 2, "IDL": 2, "LB": 2, "CB": 3, "S": 2}


def fetch(cached):
    os.makedirs(CACHE, exist_ok=True)
    for name, path in FILES.items():
        dest = os.path.join(CACHE, name)
        if cached and os.path.exists(dest):
            continue
        with urllib.request.urlopen(BASE + path, timeout=180) as r, open(dest + ".tmp", "wb") as f:
            f.write(r.read())
        os.replace(dest + ".tmp", dest)


def rows(name):
    with open(os.path.join(CACHE, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def norm(name):
    import re
    n = re.sub(r"[^a-z ]", "", name.lower().replace("-", " "))
    return " ".join(w for w in n.split() if w not in ("jr", "sr", "ii", "iii", "iv", "v"))


def slot_for(p, sacks_per_game):
    pos, dc = p["position"], p["depth_chart_position"]
    if pos == "QB": return "QB"
    if pos == "RB": return "RB"           # fullbacks too
    if pos == "WR": return "WR"
    if pos == "TE": return "TE"
    if pos == "OL": return "OT" if dc == "T" else "IOL"
    if pos == "DL": return "EDGE" if dc == "DE" else "IDL"
    if pos == "LB":
        if dc == "OLB": return "EDGE" if sacks_per_game >= 0.2 else "LB"
        return "LB"
    if pos == "DB": return "CB" if dc == "CB" else "S"
    return None                           # K, P, LS


def short_line(slot, s, g):
    if not g:
        return "No 2026 snaps"
    if slot == "QB":
        return f"{int(s['passing_yards']):,} yds · {int(s['passing_tds'])} TD · {int(s['passing_interceptions'])} INT"
    if slot == "RB":
        return f"{int(s['rushing_yards']):,} rush yds · {int(s['rushing_tds'] + s['receiving_tds'])} TD"
    if slot in ("WR", "TE"):
        return f"{int(s['receptions'])} catches · {int(s['receiving_yards']):,} yds · {int(s['receiving_tds'])} TD"
    if slot in ("OT", "IOL"):
        return f"{g} games · {int(s['snaps'])} snaps"
    if slot in ("EDGE", "IDL"):
        sk = s["def_sacks"]
        return f"{sk:g} sacks · {int(s['def_qb_hits'])} QB hits · {int(s['def_tackles_for_loss'])} TFL"
    if slot == "LB":
        return f"{int(s['tackles'])} tackles · {s['def_sacks']:g} sacks · {int(s['def_interceptions'])} INT"
    return f"{int(s['def_pass_defended'])} passes defended · {int(s['def_interceptions'])} INT · {int(s['tackles'])} tackles"


def production(slot, s, g):
    """per-game output for his position (0 if he hasn't played)"""
    if not g:
        return 0.0
    if slot == "QB":
        v = (s["passing_yards"] * 0.04 + s["passing_tds"] * 4 - s["passing_interceptions"] * 2
             + s["rushing_yards"] * 0.1 + s["rushing_tds"] * 6 + s.get("passing_epa", 0) * 0.5)
    elif slot in ("RB", "WR", "TE"):
        v = (s["rushing_yards"] + s["receiving_yards"]) * 0.1 + (s["rushing_tds"] + s["receiving_tds"]) * 6 + s["receptions"]
    elif slot in ("EDGE", "IDL"):
        v = s["def_sacks"] * 4 + s["def_qb_hits"] * 1.5 + s["def_tackles_for_loss"] * 1.5 + s["tackles"] * 0.3 + s["def_fumbles_forced"] * 2
    elif slot == "LB":
        v = s["tackles"] * 0.6 + s["def_tackles_for_loss"] * 1.5 + s["def_sacks"] * 3 + s["def_pass_defended"] * 1.5 + s["def_interceptions"] * 4
    elif slot in ("CB", "S"):
        v = s["def_pass_defended"] * 2 + s["def_interceptions"] * 5 + s["tackles"] * 0.3 + s["def_tds"] * 6
    else:
        return 0.0
    return v / g


def main():
    cached = "--cached" in sys.argv
    fetch(cached)
    roster = [p for p in rows("roster.csv") if p["status"] == "ACT"]

    # season totals by gsis id
    stat_keys = ["passing_yards", "passing_tds", "passing_interceptions", "passing_epa", "rushing_yards", "rushing_tds",
                 "receptions", "receiving_yards", "receiving_tds", "def_sacks", "def_qb_hits", "def_tackles_for_loss",
                 "def_tackles_solo", "def_tackle_assists", "def_fumbles_forced", "def_pass_defended", "def_interceptions", "def_tds"]
    tot = defaultdict(lambda: defaultdict(float))
    for r in rows("stats.csv"):
        if r.get("season_type", "REG") not in ("REG", ""):
            continue
        t = tot[r["player_id"]]
        for k in stat_keys:
            t[k] += num(r.get(k))
    for t in tot.values():
        t["tackles"] = t["def_tackles_solo"] + t["def_tackle_assists"]

    # snaps by pfr id: games played, average share of the team's snaps
    snap = defaultdict(lambda: {"g": 0, "pct": 0.0, "snaps": 0.0})
    by_name = {}                                       # many rosters rows have no pfr id: match on name + team
    for r in rows("snaps.csv"):
        by_name[(norm(r["player"]), TEAM.get(r["team"], r["team"]))] = r["pfr_player_id"]
        s = snap[r["pfr_player_id"]]
        o, d = num(r["offense_pct"]), num(r["defense_pct"])
        if o == 0 and d == 0:
            continue
        s["g"] += 1
        s["pct"] += max(o, d)
        s["snaps"] += max(num(r["offense_snaps"]), num(r["defense_snaps"]))
    weeks = max([int(r["week"]) for r in rows("snaps.csv")] or [1])

    players = []
    for p in roster:
        s = dict(tot.get(p["gsis_id"], {}))
        for k in stat_keys + ["tackles"]:
            s.setdefault(k, 0.0)
        pid = p["pfr_id"] or by_name.get((norm(p["full_name"]), TEAM.get(p["team"], p["team"])), "")
        sn = snap.get(pid, {"g": 0, "pct": 0.0, "snaps": 0.0})
        g = sn["g"]
        s["snaps"] = sn["snaps"]
        slot = slot_for(p, s["def_sacks"] / g if g else 0)
        if not slot:
            continue
        share = sn["pct"] / g if g else 0.0            # how much of the game he plays
        avail = g / weeks                              # how many games he's played
        players.append({"p": p, "slot": slot, "g": g, "s": s,
                        "use": share * (0.7 + 0.3 * avail),
                        "prod": production(slot, s, g)})

    # rate within each slot: rank on playing time and production, then map to 50-99
    for slot in SLOTS:
        group = [x for x in players if x["slot"] == slot]
        played = [x for x in group if x["g"] > 0 and x["use"] > 0.05]

        def pct_rank(key):
            vals = sorted(x[key] for x in played)
            n = max(1, len(vals) - 1)
            return lambda v: sum(1 for w in vals if w < v) / n

        use_r, prod_r = pct_rank("use"), pct_rank("prod")
        w_use = 1.0 if slot in ("OT", "IOL") else 0.45
        for x in played:
            x["score"] = w_use * use_r(x["use"]) + (1 - w_use) * prod_r(x["prod"])
        ordered = sorted(played, key=lambda x: x["score"])
        n = max(1, len(ordered) - 1)
        for i, x in enumerate(ordered):
            q = i / n                                  # 0 worst .. 1 best among players who played
            x["rating"] = round(55 + 44 * q ** 1.6)
        for x in group:
            if "rating" not in x:                      # hasn't played: backup level, a bit higher with experience
                yrs = num(x["p"]["years_exp"])
                x["rating"] = int(46 + min(10, yrs * 1.5) + (hash(x["p"]["full_name"]) % 4))

    out = []
    for x in sorted(players, key=lambda x: -x["rating"]):
        p = x["p"]
        age = ""
        if p["birth_date"][:4].isdigit():
            age = SEASON - int(p["birth_date"][:4])
        out.append([p["full_name"], TEAM.get(p["team"], p["team"]), x["slot"], x["rating"], age,
                    short_line(x["slot"], x["s"], x["g"])])

    sched = []
    with open(os.path.join(HERE, "fantasy_schedule.csv"), newline="") as f:
        for r in csv.DictReader(f):
            sc = [int(r[k]) if r[k].strip().isdigit() else None for k in ("away_score", "home_score")]
            sched.append([int(r["week"]), r["away"], r["home"]] + (sc if None not in sc else []))

    data = {"season": SEASON, "through_week": weeks, "slots": SLOTS, "players": out, "schedule": sched}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    by = defaultdict(int)
    for r in out:
        by[r[2]] += 1
    print(f"Franchise: {len(out)} players through week {weeks} -> {os.path.relpath(OUT, HERE)} ({os.path.getsize(OUT) // 1024} KB)")
    print("  " + ", ".join(f"{k} {by[k]}" for k in SLOTS))


if __name__ == "__main__":
    main()
