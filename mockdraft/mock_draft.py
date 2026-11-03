"""
NFL Mock Draft Simulator
------------------------
You draft for one (or more) teams; the computer drafts for everyone else.

Data files (edit these freely):
  teams.csv    -> team,needs        (rows in draft order; needs separated by "|", most important first)
  players.csv  -> rank,name,position,college

Run:  python mock_draft.py
"""

import csv
import random
from dataclasses import dataclass, field

TEAMS_FILE = "teams.csv"
PLAYERS_FILE = "players.csv"
RESULTS_FILE = "draft_results.csv"

# How the computer weighs things when it picks
NEED_BONUS = [12, 8, 5, 3, 2]   # bonus (in "rank spots") for top need, 2nd need, ...
RANDOMNESS = 5                  # max random swing in rank spots; higher = wilder drafts
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


def run_draft(teams, players, rounds, user_teams):
    available = list(players)
    results = []
    pick_no = 0

    for rnd in range(1, rounds + 1):
        print(f"\n========== ROUND {rnd} ==========")
        for team in teams:
            if not available:
                print("No players left!")
                return results
            pick_no += 1

            if team.name in user_teams:
                player = user_pick(team, available)
            else:
                player = cpu_pick(team, available)

            available.remove(player)
            team.picks.append(player)
            if player.position in team.needs:
                team.needs.remove(player.position)   # need filled
            results.append((rnd, pick_no, team.name, player))
            print(f"  {pick_no:>3}. {team.name:<24} {player.name} ({player.position}, {player.college})  [rank {player.rank}]")

    return results


def save_results(results, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["round", "pick", "team", "player", "position", "college", "board_rank"])
        for rnd, pick, team, p in results:
            w.writerow([rnd, pick, team, p.name, p.position, p.college, p.rank])


def choose_user_teams(teams):
    print("Teams:")
    for i, t in enumerate(teams, 1):
        print(f"  {i:>2}. {t.name}")
    raw = input("\nPick your team number(s), separated by commas (blank = watch the computer draft): ")
    chosen = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit() and 1 <= int(part) <= len(teams):
            chosen.add(teams[int(part) - 1].name)
    return chosen


def main():
    teams = load_teams(TEAMS_FILE)
    players = load_players(PLAYERS_FILE)
    print(f"Loaded {len(teams)} teams and {len(players)} prospects.\n")

    qb_count = 0
    for p in players:
        if p.position == "QB":
            qb_count += 1
    print(f"QBs in this draft class: {qb_count}\n")

    user_teams = choose_user_teams(teams)
    rounds_raw = input("How many rounds? (1-7, default 1): ").strip()
    rounds = int(rounds_raw) if rounds_raw.isdigit() and 1 <= int(rounds_raw) <= 7 else 1

    results = run_draft(teams, players, rounds, user_teams)
    save_results(results, RESULTS_FILE)

    for t in teams:
        if t.name in user_teams:
            print(f"\nYour draft class – {t.name}:")
            for p in t.picks:
                print(f"  {p.name} ({p.position}, {p.college})")
    print(f"\nFull results saved to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
