"""
NFL Mock Draft Simulator
------------------------
You draft for one (or more) teams; the computer drafts for everyone else.

Data files (edit these freely):
  teams.csv        -> team,needs          (needs separated by "|", most important first)
  players.csv      -> rank,name,position,college,...
  draft_order.csv  -> round,pick,team,from   (one row per pick, so traded picks work)

Run:  python3 mock_draft.py
"""

import csv
import os
import random
from dataclasses import dataclass, field

TEAMS_FILE = "teams.csv"
PLAYERS_FILE = "players.csv"
ORDER_FILE = "draft_order.csv"
RESULTS_FILE = "draft_results.csv"

# How the computer weighs things when it picks
NEED_BONUS = [12, 8, 5, 3, 2]   # bonus (in "rank spots") for top need, 2nd need, ...
RANDOMNESS = 4                  # max random swing in rank spots; higher = wilder drafts
LOOK_AHEAD = 15                 # CPU only considers this many best-available players


@dataclass
class Player:
    rank: int
    name: str
    position: str
    college: str


@dataclass
class Team:
    name: str
    needs: list = field(default_factory=list)
    picks: list = field(default_factory=list)


@dataclass
class Pick:
    round: int
    number: int
    team: str
    from_team: str = ""


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


def cpu_pick(team, available):
    """Pick the player with the best score: lower is better.
    Score = big-board rank - need bonus + a little randomness."""
    candidates = available[:LOOK_AHEAD]

    def score(p):
        bonus = 0
        if p.position in team.needs:
            idx = team.needs.index(p.position)
            bonus = NEED_BONUS[idx] if idx < len(NEED_BONUS) else 1
        return p.rank - bonus + random.uniform(-RANDOMNESS, RANDOMNESS)

    return min(candidates, key=score)


def show_board(available, count=20, position=None):
    shown = [p for p in available if position is None or p.position == position][:count]
    print(f"\n{'#':>4}  {'Name':<24}{'Pos':<6}College")
    print("-" * 52)
    for p in shown:
        print(f"{p.rank:>4}  {p.name:<24}{p.position:<6}{p.college}")
    if not shown:
        print("  (no players found)")


def show_need_hints(team, available):
    print("\n    Best available at your needs:")
    for need in team.needs:
        best = None
        for p in available:
            if p.position == need:
                best = p
                break
        if best:
            print(f"      {need:<5} #{best.rank} {best.name} ({best.college})")
        else:
            print(f"      {need:<5} none left")


def user_pick(team, available):
    print(f"\n>>> You're on the clock: {team.name}")
    print(f"    Needs: {', '.join(team.needs) or 'none listed'}")
    show_need_hints(team, available)
    show_board(available)
    print("\nType a rank number to draft that player, a position (e.g. WR) to filter, or 'more' to see more.")
    while True:
        choice = input("Your pick: ").strip().upper()
        if choice == "MORE":
            show_board(available, count=50)
        elif choice.isdigit():
            match = next((p for p in available if p.rank == int(choice)), None)
            if match:
                return match
            print("That player isn't available.")
        elif choice:
            show_board(available, count=50, position=choice)


def run_draft(teams, players, order, rounds, user_teams):
    by_name = {t.name: t for t in teams}
    available = list(players)
    results = []
    current_round = 0

    for pick in order:
        if pick.round > rounds:
            break
        if pick.round != current_round:
            current_round = pick.round
            print(f"\n========== ROUND {current_round} ==========")
        if not available:
            print("No players left!")
            break

        team = by_name[pick.team]
        if team.name in user_teams:
            player = user_pick(team, available)
        else:
            player = cpu_pick(team, available)

        available.remove(player)
        team.picks.append(player)
        if player.position in team.needs:
            team.needs.remove(player.position)   # need filled
        results.append((pick, player))

        via = f" (from {pick.from_team})" if pick.from_team else ""
        print(f"  {pick.number:>3}. {team.name + via:<40} {player.name} ({player.position}, {player.college})  [rank {player.rank}]")

    return results


def save_results(results, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["round", "pick", "team", "from", "player", "position", "college", "board_rank"])
        for pick, p in results:
            w.writerow([pick.round, pick.number, pick.team, pick.from_team, p.name, p.position, p.college, p.rank])


def choose_user_teams(teams, order):
    listed = sorted(teams, key=lambda t: t.name)
    print("Teams [their round 1 picks]:")
    for i, t in enumerate(listed, 1):
        r1 = [str(p.number) for p in order if p.team == t.name and p.round == 1]
        print(f"  {i:>2}. {t.name:<24} [{', '.join(r1) or 'none'}]")
    raw = input("\nPick your team number(s), separated by commas (blank = watch the computer draft): ")
    chosen = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit() and 1 <= int(part) <= len(listed):
            chosen.add(listed[int(part) - 1].name)
    return chosen


def main():
    teams = load_teams(TEAMS_FILE)
    players = load_players(PLAYERS_FILE)
    order = load_draft_order(ORDER_FILE, teams)
    print(f"Loaded {len(teams)} teams, {len(players)} prospects and {len(order)} picks.\n")

    qb_count = 0
    for p in players:
        if p.position == "QB":
            qb_count += 1
    print(f"QBs in this draft class: {qb_count}\n")

    user_teams = choose_user_teams(teams, order)
    rounds_raw = input("How many rounds? (1-7, default 1): ").strip()
    rounds = int(rounds_raw) if rounds_raw.isdigit() and 1 <= int(rounds_raw) <= 7 else 1

    results = run_draft(teams, players, order, rounds, user_teams)
    save_results(results, RESULTS_FILE)

    for t in teams:
        if t.name in user_teams:
            print(f"\nYour draft class – {t.name}:")
            for p in t.picks:
                print(f"  {p.name} ({p.position}, {p.college})")
    print(f"\nFull results saved to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
