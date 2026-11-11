"""
Download past seasons (game by game) and save each player's season totals in fantasy points,
so dynasty values and 2027 projections don't hinge on one season. Run once a year (or anytime):

    python3 fetch_seasons.py 2024 2025

Writes fantasy_seasons.csv: name, pos, season, games, and points in each scoring format.
"""

import csv
import io
import os
import sys
import urllib.request

import fantasy

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{}.csv"
COLS = {"passing_yards": "pass_yds", "passing_tds": "pass_td", "passing_interceptions": "int",
        "rushing_yards": "rush_yds", "rushing_tds": "rush_td", "receptions": "rec",
        "receiving_yards": "rec_yds", "receiving_tds": "rec_td"}


def main(seasons):
    keys = [k for k, _ in fantasy.FORMATS]
    out = []
    for season in seasons:
        with urllib.request.urlopen(URL.format(season), timeout=180) as r:
            rows = list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
        tot = {}
        for r in rows:
            if r["season_type"] != "REG" or r["position"] not in ("QB", "RB", "WR", "TE"):
                continue
            g = {new: r[old] for old, new in COLS.items()}
            g["pos"] = r["position"]
            t = tot.setdefault(r["player_display_name"], {"pos": r["position"], "games": 0, **{k: 0.0 for k in keys}})
            t["games"] += 1
            for k in keys:
                t[k] += fantasy.points(g, k)
        for name, t in tot.items():
            out.append({"name": name, "pos": t["pos"], "season": season, "games": t["games"],
                        **{k: round(t[k], 1) for k in keys}})
        print(f"{season}: {len(tot)} players")
    with open(os.path.join(HERE, "fantasy_seasons.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["name", "pos", "season", "games"] + keys)
        w.writeheader()
        w.writerows(out)


if __name__ == "__main__":
    main([int(x) for x in sys.argv[1:]] or [2024, 2025])
