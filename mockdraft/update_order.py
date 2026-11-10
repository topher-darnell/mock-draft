"""
Rebuilds draft_order.csv (all 7 rounds) from this week's standings.

    python3 update_order.py standings.txt

standings.txt lists every team's ORIGINAL pick slot in round-1 order, one line per group
of teams with the same record (ties already broken by strength of schedule, lowest SOS
first), using these abbreviations:

    LAC
    TEN MIA
    IND PHI NYJ
    ...

Who OWNS each pick (trades) is kept from the current draft_order.csv: a pick is matched by
(round, original team), so record a new trade by editing that pick's team/from columns first.
Rounds 2-7 use the same order, except teams with the same record take turns going first.
Compensatory picks (a second pick from the same original team in a round) stay at the end
of their round.
"""

import collections
import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER_FILE = os.path.join(HERE, "draft_order.csv")

TEAMS = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LAC": "Los Angeles Chargers", "LAR": "Los Angeles Rams", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}


def main(standings_path):
    groups = [line.split() for line in open(standings_path) if line.strip() and not line.startswith("#")]
    flat = [t for g in groups for t in g]
    unknown = [t for t in flat if t not in TEAMS]
    assert not unknown, f"unknown team abbreviations: {unknown}"
    assert sorted(flat) == sorted(TEAMS), "standings.txt must list all 32 teams exactly once"

    rows = list(csv.DictReader(open(ORDER_FILE, newline="")))
    owner = {}
    comps = collections.defaultdict(list)
    for r in rows:
        rnd, orig = int(r["round"]), r["from"] or r["team"]
        if (rnd, orig) in owner:
            comps[rnd].append(r)
        else:
            owner[(rnd, orig)] = r["team"]
    for rnd in range(1, 8):
        assert sum(1 for (r, _) in owner if r == rnd) == 32, f"round {rnd} doesn't have one pick per team"

    out, pick = [], 0
    for rnd in range(1, 8):
        for group in groups:
            k = (rnd - 1) % len(group)
            for abbr in group[k:] + group[:k]:
                orig = TEAMS[abbr]
                pick += 1
                team = owner[(rnd, orig)]
                out.append({"round": rnd, "pick": pick, "team": team, "from": "" if team == orig else orig})
        for c in comps[rnd]:
            pick += 1
            out.append({"round": rnd, "pick": pick, "team": c["team"], "from": c["from"]})

    with open(ORDER_FILE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["round", "pick", "team", "from"])
        w.writeheader()
        w.writerows(out)
    print(f"Wrote {ORDER_FILE}: {len(out)} picks. Round 1:")
    for r in out[:32]:
        print(f"  {r['pick']:>2} {r['team']}" + (f" (from {r['from']})" if r["from"] else ""))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "standings.txt"))
