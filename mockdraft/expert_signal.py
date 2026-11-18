"""What the expert mocks (expert_mocks.csv) say about each player, for the computer's picks.

    value(p)       the player's board rank blended with his average pick in expert mocks
    fit(name, tm)  how many expert mocks send this player to this team

Weight on the experts grows with how many mocks include the player (15% per mock, at most 50%).
Players no expert took keep their plain board rank.
"""
import csv
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PER_MOCK, MAX_WEIGHT = 0.15, 0.5
FIT_BONUS, FIT_CAP = 2.5, 7.5          # rank spots per expert mock that pairs player and team


def load():
    path = os.path.join(HERE, "expert_mocks.csv")
    picks, teams = defaultdict(list), defaultdict(Counter)
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                picks[r["player"]].append(int(r["pick"]))
                teams[r["player"]][r["team"]] += 1
    return {n: {"avg": round(sum(v) / len(v), 1), "n": len(v), "teams": dict(teams[n])} for n, v in picks.items()}


EXPERT = load()


def value(rank, name):
    e = EXPERT.get(name)
    if not e:
        return rank
    w = min(MAX_WEIGHT, PER_MOCK * e["n"])
    return rank * (1 - w) + e["avg"] * w


def fit(name, team):
    e = EXPERT.get(name)
    return min(FIT_CAP, FIT_BONUS * e["teams"].get(team, 0)) if e else 0
