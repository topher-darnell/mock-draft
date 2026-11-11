"""
One logical 7-round mock draft for the website (home page and team pages).

Each pick goes to the player with the best score among the best-available players:
  score = where he usually goes (his average pick in the 1,000 simulations)
          - a boost if he fills one of the team's needs (the need is crossed off once filled)
          - a small boost if the team takes him often at this exact pick in the simulations
          + a penalty for each player the team already took at his position (a second QB is
            almost never worth it), and for a QB when the team has a franchise QB (config.py)
Lower is better. Everything scales up in later rounds, where the gaps between players are bigger.

    python3 consensus.py      prints the whole mock, team by team
"""

import csv
import json
import os

from config import FRANCHISE_QB, QB_PENALTY, stack_penalty

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, "..", "docs"))
NEED_BONUS = [8, 6, 4, 3, 2]
LOOK = 20                       # only the 20 best-available players are considered


def _read_csv(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _read_json(name):
    with open(os.path.join(DOCS, "data", name), encoding="utf-8") as f:
        return json.load(f)


def build():
    """returns [(slot, player_dict)] for every pick in order"""
    players = _read_json("players.json")
    sims = _read_json("sims.json")
    needs = {t["name"]: list(t["needs"]) for t in _read_json("teams.json")}
    adp = {r["name"]: float(r["avg_pick"]) for r in _read_csv("adp.csv") if r["avg_pick"] and float(r["drafted_pct"] or 0) > 0}
    where = lambda p: adp.get(p["name"], 260 + p["rank"])
    pool = sorted(players, key=where)
    taken, took = set(), {}
    out = []
    for s in sims["slots"]:
        team, pick = s["team"], s["pick"]
        scale = max(1.0, pick / 32)
        fav = {n: pct for n, _, pct in s["top"]}
        mine = took.setdefault(team, [])
        want = needs.setdefault(team, [])
        cands = [p for p in pool if p["name"] not in taken][:LOOK]

        def score(p):
            pos = p["position"]
            sc = where(p)
            if pos in want:
                i = want.index(pos)
                sc -= (NEED_BONUS[i] if i < len(NEED_BONUS) else 1) * scale
            sc -= fav.get(p["name"], 0) * 0.08 * scale
            sc += stack_penalty(pos, sum(1 for q in mine if q["position"] == pos), pick)
            if pos == "QB" and team in FRANCHISE_QB:
                sc += QB_PENALTY.get(s["round"], 25) * scale
            return sc

        best = min(cands, key=score)
        taken.add(best["name"])
        mine.append(best)
        if best["position"] in want:
            want.remove(best["position"])
        out.append((s, best))
    return out


if __name__ == "__main__":
    mock = build()
    by_team = {}
    for s, p in mock:
        by_team.setdefault(s["team"], []).append(f"{s['round']}.{s['pick']} {p['name']} {p['position']}")
    for t in sorted(by_team):
        print(t)
        for line in by_team[t]:
            print("   ", line)
