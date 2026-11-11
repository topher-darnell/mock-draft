"""
Download week-by-week player stats for the Trending tab on the Fantasy page.

Source: nflverse (free, public NFL data on GitHub), file stats_player_week_<season>.csv.
We keep only QBs, RBs, WRs and TEs and the columns we use, in fantasy_weekly.csv.

    python3 fetch_weekly.py          # 2026 season
"""

import csv
import io
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
URL = f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{SEASON}.csv"
TEAM = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS"}          # nflverse spellings -> ours
KEEP = {"player_display_name": "name", "position": "pos", "team": "team", "week": "week",
        "passing_yards": "pass_yds", "passing_tds": "pass_td", "passing_interceptions": "int",
        "carries": "car", "rushing_yards": "rush_yds", "rushing_tds": "rush_td",
        "targets": "tgt", "receptions": "rec", "receiving_yards": "rec_yds", "receiving_tds": "rec_td",
        "target_share": "tgt_share"}


def main():
    with urllib.request.urlopen(URL, timeout=120) as r:
        text = r.read().decode("utf-8")
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        if r["season_type"] != "REG" or r["position"] not in ("QB", "RB", "WR", "TE"):
            continue
        row = {new: r[old] for old, new in KEEP.items()}
        row["team"] = TEAM.get(row["team"], row["team"])
        rows.append(row)
    rows.sort(key=lambda x: (int(x["week"]), x["name"]))
    with open(os.path.join(HERE, "fantasy_weekly.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(KEEP.values()))
        w.writeheader()
        w.writerows(rows)
    weeks = sorted({int(x["week"]) for x in rows})
    print(f"{len(rows)} player-games, weeks {weeks[0]}-{weeks[-1]}")


if __name__ == "__main__":
    main()
