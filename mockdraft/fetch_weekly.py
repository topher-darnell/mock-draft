"""
Download week-by-week player stats and the schedule, for Trending and the rest-of-season rankings.

Source: nflverse (free, public NFL data on GitHub):
  stats_player_week_<season>.csv -> fantasy_weekly.csv (QBs, RBs, WRs and TEs, the columns we use; only
                                    weeks where every game is final, so projections don't shift mid-week)
                                    + fantasy_live.csv (the week in progress, for the scores page)
  same file, kickers              -> fantasy_k_weekly.csv (+ fantasy_k_live.csv)
  stats_team_week_<season>.csv   -> fantasy_dst_weekly.csv (+ fantasy_dst_live.csv): each defense's sacks,
                                    takeaways, scores and blocks, plus points allowed from the final score
  schedules/games.csv            -> fantasy_schedule.csv (this season's regular-season games, kickoff, final scores)
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
TEAM_STATS = f"https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_{SEASON}.csv"
INJURIES = f"https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{SEASON}.csv"
TEAM = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS"}          # nflverse spellings -> ours
KEEP = {"player_display_name": "name", "position": "pos", "team": "team", "opponent_team": "opp", "week": "week",
        "completions": "cmp", "attempts": "att", "passing_yards": "pass_yds", "passing_tds": "pass_td", "passing_interceptions": "int",
        "carries": "car", "rushing_yards": "rush_yds", "rushing_tds": "rush_td",
        "targets": "tgt", "receptions": "rec", "receiving_yards": "rec_yds", "receiving_tds": "rec_td",
        "target_share": "tgt_share"}


def main():
    with urllib.request.urlopen(SCHEDULE, timeout=120) as r:
        games = [g for g in csv.DictReader(io.StringIO(r.read().decode("utf-8")))
                 if g["season"] == str(SEASON) and g["game_type"] == "REG"]
    with open(os.path.join(HERE, "fantasy_schedule.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["week", "away", "home", "day", "time", "away_score", "home_score"])
        for g in sorted(games, key=lambda g: (int(g["week"]), g["gameday"], g["gametime"])):
            w.writerow([g["week"], TEAM.get(g["away_team"], g["away_team"]), TEAM.get(g["home_team"], g["home_team"]),
                        g["gameday"], g["gametime"], g["away_score"], g["home_score"]])
    print(f"{len(games)} games on the {SEASON} schedule")
    # the first week with a game not yet final: its stats are "live" until the whole week is done
    open_weeks = sorted({int(g["week"]) for g in games if g["away_score"] == ""})
    live_week = open_weeks[0] if open_weeks else 99

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
    done = [r for r in rows if int(r["week"]) < live_week]
    live = [r for r in rows if int(r["week"]) == live_week]
    for name, part in (("fantasy_weekly.csv", done), ("fantasy_live.csv", live)):
        with open(os.path.join(HERE, name), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(KEEP.values()), lineterminator="\n")
            w.writeheader()
            w.writerows(part)
    # kickers, from the same player file
    kcols = ["name", "team", "opp", "week", "fg_0_39", "fg_40_49", "fg_50", "fg_missed", "pat_made", "pat_missed"]
    krows = []
    for r in csv.DictReader(io.StringIO(text)):
        if r["season_type"] != "REG" or r["position"] != "K":
            continue
        n = lambda c: int(float(r[c] or 0))
        krows.append([r["player_display_name"], TEAM.get(r["team"], r["team"]), TEAM.get(r["opponent_team"], r["opponent_team"]), r["week"],
                      n("fg_made_0_19") + n("fg_made_20_29") + n("fg_made_30_39"), n("fg_made_40_49"),
                      n("fg_made_50_59") + n("fg_made_60_"), n("fg_missed"), n("pat_made"), n("pat_missed")])
    # defenses: team stats + points allowed from the final score
    with urllib.request.urlopen(TEAM_STATS, timeout=120) as r:
        team_text = r.read().decode("utf-8")
    allowed = {}
    for g in games:
        if g["away_score"] != "":
            a, h = TEAM.get(g["away_team"], g["away_team"]), TEAM.get(g["home_team"], g["home_team"])
            allowed[(g["week"], a)] = g["home_score"]
            allowed[(g["week"], h)] = g["away_score"]
    dcols = ["team", "opp", "week", "sacks", "int", "fum_rec", "safety", "td", "blocks", "pts_allowed"]
    drows = []
    for r in csv.DictReader(io.StringIO(team_text)):
        if r["season_type"] != "REG":
            continue
        t = TEAM.get(r["team"], r["team"])
        n = lambda c: float(r.get(c) or 0)
        drows.append([t, TEAM.get(r["opponent_team"], r["opponent_team"]), r["week"], n("def_sacks"), int(n("def_interceptions")),
                      int(n("fumble_recovery_opp")), int(n("def_safeties")), int(n("def_tds") + n("special_teams_tds") + n("fumble_recovery_tds")),
                      int(n("def_fg_blocks") + n("def_punt_blocks")), allowed.get((r["week"], t), "")])
    for base, cols, part in (("fantasy_k", kcols, krows), ("fantasy_dst", dcols, drows)):
        for suffix, keep in (("weekly", lambda w: int(w) < live_week), ("live", lambda w: int(w) == live_week)):
            with open(os.path.join(HERE, f"{base}_{suffix}.csv"), "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f, lineterminator="\n")
                w.writerow(cols)
                w.writerows(sorted((x for x in part if keep(x[cols.index("week")])), key=lambda x: (int(x[cols.index("week")]), x[0])))
    print(f"{len(krows)} kicker games and {len(drows)} defense games saved")

    weeks = sorted({int(x["week"]) for x in done})
    print(f"{len(done)} player-games, weeks {weeks[0]}-{weeks[-1]} (last full week: {weeks[-1]})")
    if live:
        print(f"{len(live)} player-games so far in week {live_week} (saved for the scores page only)")

    # roster status (ACT = active, RES = injured reserve and similar) and the official injury report
    def get(url):
        with urllib.request.urlopen(url, timeout=180) as r:
            return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
    roster = [r for r in get(ROSTERS) if r["position"] in ("QB", "RB", "WR", "TE")]
    wk = max(int(r["week"]) for r in roster)
    latest = {}                                   # each player's most recent roster row (his current team)
    for r in sorted(roster, key=lambda r: int(r["week"])):
        latest[r["full_name"]] = r
    inj_rows = [r for r in get(INJURIES) if r["week"] == str(wk)]
    report = {r["full_name"]: r for r in inj_rows}
    # a team's final game statuses (Out/Doubtful/Questionable) are published once anyone on it has one;
    # from then on the official report beats week-only tags typed into fantasy_injuries.csv earlier in the week
    final_teams = {TEAM.get(r["team"], r["team"]) for r in inj_rows if (r.get("report_status") or "").strip()}
    with open(os.path.join(HERE, "fantasy_status.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["week", "name", "team", "roster", "report", "injury", "final"])
        for r in latest.values():
            if r["status"] == "CUT" or int(r["week"]) < wk - 2:
                continue                          # released, or not on a roster lately
            rep = report.get(r["full_name"], {}) if r["week"] == str(wk) else {}
            w.writerow([r["week"], r["full_name"], TEAM.get(r["team"], r["team"]), r["status"],
                        rep.get("report_status", ""), rep.get("report_primary_injury", "") or rep.get("practice_primary_injury", ""),
                        "1" if TEAM.get(r["team"], r["team"]) in final_teams and r["week"] == str(wk) else ""])
    print(f"roster status for week {wk} saved")


if __name__ == "__main__":
    main()
