"""Franchise mode data: every active NFL player with a 50-99 rating.

    python3 franchise.py              # download the newest nflverse files, write docs/games/franchise-data.json
    python3 franchise.py --cached     # reuse the files already downloaded (in /tmp/bhg-franchise)

Source: nflverse (free, public): the 2026 roster, weekly player stats and snap counts.
Ratings are rank-based within each position group, blending three seasons and a track record:
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
    f"snaps_{SEASON - 2}.csv": f"snap_counts/snap_counts_{SEASON - 2}.csv",
    f"snaps_{SEASON - 1}.csv": f"snap_counts/snap_counts_{SEASON - 1}.csv",
    f"stats_{SEASON - 2}.csv": f"stats_player/stats_player_week_{SEASON - 2}.csv",
    f"stats_{SEASON - 1}.csv": f"stats_player/stats_player_week_{SEASON - 1}.csv",
    "draft_picks.csv": "draft_picks/draft_picks.csv",
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


# how good a player can still get: young players grow until their position's peak age,
# faster with high draft capital or a big jump this season
PEAK = {"QB": 30, "RB": 25, "WR": 27, "TE": 28, "OT": 28, "IOL": 28,
        "EDGE": 27, "IDL": 27, "LB": 26, "CB": 26, "S": 27}
GROW = {21: 5.4, 22: 4.8, 23: 4.2, 24: 3.6, 25: 2.6, 26: 1.9, 27: 1.3, 28: 0.8, 29: 0.5}


def potential(x, age):
    r = x["rating"]
    if not isinstance(age, int):
        return r
    f = x.get("form", {})
    trend = 0.0
    if SEASON in f:
        prior = [f[y]["score"] for y in f if y != SEASON]
        if prior:
            trend = max(0.0, f[SEASON]["score"] - sum(prior) / len(prior))
    talent = 0.6 + 0.5 * x.get("cap", 0) + 0.8 * trend
    if x.get("score") is None:                      # barely played: draft capital is all we know
        talent = 0.5 + 0.7 * x.get("cap", 0)
    grow = sum(GROW.get(a, 5.4 if a < 21 else 0) for a in range(age, PEAK[x["slot"]]))
    room = min(1, max(0.3, 1 - (r - 50) / 70))       # harder to climb once you're already great
    return max(r, int(min(TOP.get(x["slot"], 99), round(r + grow * talent * room))))


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


SEASONS = [SEASON - 2, SEASON - 1, SEASON]
SEASON_W = {SEASON: 0.34, SEASON - 1: 0.36, SEASON - 2: 0.30}  # three seasons, about evenly
W_PED, W_PED_OL = 0.30, 0.80                                   # how much the track record counts
RATE_LO, CURVE = 54, 0.62
# the best player at each spot: a 99 is for the game-changing positions only
TOP = {"QB": 99, "WR": 99, "EDGE": 99, "RB": 97, "TE": 97, "OT": 97, "CB": 97, "IDL": 97, "IOL": 95, "LB": 95, "S": 95}
# per position: (lowest rating for a player who plays, how fast ratings climb toward 99)
SHAPE = {"QB": (61, 0.5), "RB": (67, 0.4), "WR": (67, 0.4), "TE": (61, 0.4), "OT": (64, 0.5), "IOL": (64, 0.4),
         "EDGE": (67, 0.4), "IDL": (64, 0.4), "LB": (64, 0.4), "CB": (67, 0.4), "S": (67, 0.4)}

STAT_KEYS = ["passing_yards", "passing_tds", "passing_interceptions", "passing_epa", "rushing_yards", "rushing_tds",
             "receptions", "receiving_yards", "receiving_tds", "def_sacks", "def_qb_hits", "def_tackles_for_loss",
             "def_tackles_solo", "def_tackle_assists", "def_fumbles_forced", "def_pass_defended", "def_interceptions", "def_tds"]


def season_data(stats_f, snaps_f):
    tot = defaultdict(lambda: defaultdict(float))
    for r in rows(stats_f):
        if r.get("season_type", "REG") not in ("REG", ""):
            continue
        t = tot[r["player_id"]]
        for k in STAT_KEYS:
            t[k] += num(r.get(k))
    for t in tot.values():
        t["tackles"] = t["def_tackles_solo"] + t["def_tackle_assists"]
    snap = defaultdict(lambda: {"g": 0, "pct": 0.0, "snaps": 0.0})
    by_name = {}
    weeks = 1
    for r in rows(snaps_f):
        if r.get("game_type", "REG") != "REG":
            continue
        weeks = max(weeks, int(r["week"]))
        by_name[norm(r["player"])] = r["pfr_player_id"]          # the player's name alone: he may have changed teams
        by_name[(norm(r["player"]), TEAM.get(r["team"], r["team"]))] = r["pfr_player_id"]
        o, d = num(r["offense_pct"]), num(r["defense_pct"])
        if o == 0 and d == 0:
            continue
        s = snap[r["pfr_player_id"]]
        s["g"] += 1
        s["pct"] += max(o, d)
        s["snaps"] += max(num(r["offense_snaps"]), num(r["defense_snaps"]))
    return {"tot": tot, "snap": snap, "by_name": by_name, "weeks": weeks}


def player_season(fd, p):
    s = dict(fd["tot"].get(p["gsis_id"], {}))
    for k in STAT_KEYS + ["tackles"]:
        s.setdefault(k, 0.0)
    team = TEAM.get(p["team"], p["team"])
    pid = p["pfr_id"] or fd["by_name"].get((norm(p["full_name"]), team)) or fd["by_name"].get(norm(p["full_name"]), "")
    sn = fd["snap"].get(pid, {"g": 0, "pct": 0.0, "snaps": 0.0})
    g = sn["g"]
    s["snaps"] = sn["snaps"]
    share = sn["pct"] / g if g else 0.0
    use = share * (0.7 + 0.3 * g / fd["weeks"])
    return s, g, use


def main():
    cached = "--cached" in sys.argv
    fetch(cached)
    roster = [p for p in rows("roster.csv") if p["status"] in ("ACT", "RES", "INA")]
    hurt = {p["gsis_id"] for p in roster if p["status"] != "ACT"}
    season_weeks = {}
    forms = {}                                         # season -> {"tot": stats by gsis, "snap": by pfr, "by_name": ...}
    for yr in SEASONS:
        stats_f, snaps_f = ("stats.csv", "snaps.csv") if yr == SEASON else (f"stats_{yr}.csv", f"snaps_{yr}.csv")
        if not os.path.exists(os.path.join(CACHE, stats_f)):
            continue
        forms[yr] = season_data(stats_f, snaps_f)
        season_weeks[yr] = forms[yr]["weeks"]
    weeks = season_weeks[SEASON]
    picks = {r["gsis_id"]: r for r in rows("draft_picks.csv") if r["gsis_id"]}

    players = []
    for p in roster:
        cur = forms[SEASON]
        s, g, use = player_season(cur, p)
        slot = slot_for(p, s["def_sacks"] / g if g else 0)
        if not slot:
            continue
        x = {"p": p, "slot": slot, "g": g, "s": s, "hurt": p["gsis_id"] in hurt, "form": {}}
        for yr, fd in forms.items():
            ss, gg, uu = player_season(fd, p)
            if gg >= (1 if yr == SEASON else 4) and uu > 0.05:
                x["form"][yr] = {"use": uu, "prod": production(slot, ss, gg)}
        d = picks.get(p["gsis_id"], {})
        yrs = max(1, SEASON - int(num(d.get("season")) or SEASON) + 1) if d else max(1, int(num(p["years_exp"])) + 1)
        x["ped"] = {"honors": num(d.get("probowls")) + 2 * num(d.get("allpro")),
                    "av": num(d.get("w_av")) / yrs,
                    "draft": (300 - (num(d.get("pick")) or 300)) / 300 if yrs <= 3 else 0.0}
        x["cap"] = (300 - (num(d.get("pick")) or 300)) / 300 if d else 0.0   # draft capital, 0 = undrafted
        players.append(x)

    def ranker(vals):
        vals = sorted(vals)
        n = max(1, len(vals) - 1)
        import bisect
        return lambda v: bisect.bisect_left(vals, v) / n

    for slot in SLOTS:
        group = [x for x in players if x["slot"] == slot]
        w_use = 1.0 if slot in ("OT", "IOL") else 0.45
        # this season and the two before, each ranked within the position
        for yr in forms:
            played = [x for x in group if yr in x["form"]]
            use_r = ranker([x["form"][yr]["use"] for x in played])
            prod_r = ranker([x["form"][yr]["prod"] for x in played])
            for x in played:
                f = x["form"][yr]
                f["score"] = w_use * use_r(f["use"]) + (1 - w_use) * prod_r(f["prod"])
        # track record: Pro Bowls / All-Pros, career value per year, draft slot for young players
        hon_r = ranker([x["ped"]["honors"] for x in group])
        av_r = ranker([x["ped"]["av"] for x in group])
        dr_r = ranker([x["ped"]["draft"] for x in group])
        w_ped = W_PED_OL if slot in ("OT", "IOL") else W_PED
        for x in group:
            pd = x["ped"]
            ped = 0.45 * (hon_r(pd["honors"]) if pd["honors"] else 0) + 0.35 * av_r(pd["av"]) + 0.20 * dr_r(pd["draft"])
            fw = {yr: SEASON_W[yr] for yr in x["form"]}
            if fw:
                form = sum(x["form"][yr]["score"] * w for yr, w in fw.items()) / sum(fw.values())
                # a little less sure about players with only part of a track record
                form *= 0.85 + 0.15 * min(1, sum(fw.values()) / sum(SEASON_W.values()))
                x["score"] = (1 - w_ped) * form + w_ped * ped
            else:
                x["score"] = None
                x["pedv"] = ped
        rated = sorted([x for x in group if x["score"] is not None], key=lambda x: x["score"])
        n = max(1, len(rated) - 1)
        for i, x in enumerate(rated):
            lo, cv = SHAPE.get(slot, (RATE_LO, CURVE))
            top = TOP.get(slot, 99)
            x["rating"] = round(top - (top - lo) * (1 - i / n) ** cv)   # only the very best reach the 90s
        for x in group:
            if x["score"] is None:                     # never really played: backup level, a bit higher with pedigree
                x["rating"] = int(46 + 12 * x["pedv"] + min(4, num(x["p"]["years_exp"])))

    # your own calls win: franchise_overrides.csv (player, team, rating or "retired")
    ov_path = os.path.join(HERE, "franchise_overrides.csv")
    if os.path.exists(ov_path):
        with open(ov_path, newline="", encoding="utf-8") as f:
            ov = {(r["player"].strip(), r["team"].strip()): r["rating"].strip().lower() for r in csv.DictReader(f)}
        keep = []
        for x in players:
            k = (x["p"]["full_name"], TEAM.get(x["p"]["team"], x["p"]["team"]))
            v = ov.get(k, "")
            if v == "retired":                         # still on a roster list, but done playing
                continue
            if v.isdigit():
                x["rating"] = max(40, min(99, int(v)))
            keep.append(x)
        players = keep

    out = []
    for x in sorted(players, key=lambda x: -x["rating"]):
        p = x["p"]
        age = ""
        if p["birth_date"][:4].isdigit():
            age = SEASON - int(p["birth_date"][:4])
        pot = potential(x, age)
        line = short_line(x["slot"], x["s"], x["g"])
        if x["hurt"]:
            line = "Injured · " + line
        out.append([p["full_name"], TEAM.get(p["team"], p["team"]), x["slot"], x["rating"], age, line, pot])

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
