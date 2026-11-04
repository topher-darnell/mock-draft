"""Reading the CSV files in, and saving results out."""

import csv
import os

from config import TEAMS_FILE
from models import Player, Team, Pick


def load_teams(path):
    with open(path, newline="", encoding="utf-8") as f:
        return [
            Team(row["team"].strip(), [n.strip().upper() for n in row["needs"].split("|") if n.strip()])
            for row in csv.DictReader(f)
        ]


def load_players(path):
    with open(path, newline="", encoding="utf-8") as f:
        players = [
            Player(int(row["rank"]), row["name"].strip(), row["position"].strip().upper(), row["college"].strip())
            for row in csv.DictReader(f)
        ]
    return sorted(players, key=lambda p: p.rank)


def load_draft_order(path, teams):
    """One row per pick. If the file is missing, every team picks once per
    round in the order teams.csv lists them."""
    if not os.path.exists(path):
        return [Pick(rnd, (rnd - 1) * len(teams) + i, t.name)
                for rnd in range(1, 8) for i, t in enumerate(teams, 1)]

    team_names = {t.name for t in teams}
    picks = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["team"].strip()
            if name not in team_names:
                raise ValueError(f"{path}: '{name}' (pick {row['pick']}) isn't in {TEAMS_FILE}")
            picks.append(Pick(int(row["round"]), int(row["pick"]), name, row.get("from", "").strip()))
    return sorted(picks, key=lambda p: p.number)


def load_trade_chart(path):
    chart = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            chart[int(row["pick"])] = float(row["value"])
    return chart


def save_results(results, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["round", "pick", "team", "from", "player", "position", "college", "board_rank"])
        for pick, p in results:
            w.writerow([pick.round, pick.number, pick.team, pick.from_team, p.name, p.position, p.college, p.rank])
