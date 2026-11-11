"""
Download week-by-week player stats and the schedule, for Trending and the rest-of-season rankings.

Source: nflverse (free, public NFL data on GitHub):
  stats_player_week_<season>.csv -> fantasy_weekly.csv (QBs, RBs, WRs and TEs, the columns we use)
  schedules/games.csv            -> fantasy_schedule.csv (this season's regular-season games)
  weekly_rosters + injuries      -> fantasy_status.csv (latest week: roster status, injury report)

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
SCHEDULE = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"
ROSTERS = f"https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{SEASON}.csv"
INJURIES = f"https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{SEASON}.csv"
TEAM = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS"}          # nflverse spellings -> ours
KEEP = {"player_display_name": "name", "position": "pos", "team": "team", "opponent_team": "opp", "week": "week",
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
        row["opp"] = TEAM.get(row["opp"], row["opp"])
        rows.append(row)
    rows.sort(key=lambda x: (int(x["week"]), x["name"]))
    with open(os.path.join(HERE, "fantasy_weekly.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(KEEP.values()))
        w.writeheader()
        w.writerows(rows)
    weeks = sorted({int(x["week"]) for x in rows})
    print(f"{len(rows)} player-games, weeks {weeks[0]}-{weeks[-1]} (last week played: {weeks[-1]})")

    with urllib.request.urlopen(SCHEDULE, timeout=120) as r:
        games = [g for g in csv.DictReader(io.StringIO(r.read().decode("utf-8")))
                 if g["season"] == str(SEASON) and g["game_type"] == "REG"]
    with open(os.path.join(HERE, "fantasy_schedule.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["week", "away", "home", "day"])
        for g in sorted(games, key=lambda g: (int(g["week"]), g["gameday"])):
            w.writerow([g["week"], TEAM.get(g["away_team"], g["away_team"]), TEAM.get(g["home_team"], g["home_team"]), g["gameday"]])
    print(f"{len(games)} games on the {SEASON} schedule")

    # roster status (ACT = active, RES = injured reserve and similar) and the official injury report
    def get(url):
        with urllib.request.urlopen(url, timeout=180) as r:
            return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
    roster = [r for r in get(ROSTERS) if r["position"] in ("QB", "RB", "WR", "TE")]
    wk = max(int(r["week"]) for r in roster)
    report = {r["full_name"]: r for r in get(INJURIES) if r["week"] == str(wk)}
    with open(os.path.join(HERE, "fantasy_status.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["week", "name", "team", "roster", "report", "injury"])
        for r in roster:
            if r["week"] != str(wk):
                continue
            rep = report.get(r["full_name"], {})
            w.writerow([wk, r["full_name"], TEAM.get(r["team"], r["team"]), r["status"],
                        rep.get("report_status", ""), rep.get("report_primary_injury", "") or rep.get("practice_primary_injury", "")])
    print(f"roster status for week {wk} saved")


if __name__ == "__main__":
    main()
