"""
NFL Mock Draft Simulator
------------------------
You draft for one (or more) teams; the computer drafts for everyone else.

Run:  python3 mock_draft.py

When you're on the clock, type T to see trade-down offers.
At the start of each round, type a pick number to try trading up to it.

Files:
  mock_draft.py   - runs the draft (this file)
  config.py       - settings you can tweak
  models.py       - Player, Team and Pick
  data.py         - loading the CSV files and saving results
  draft_logic.py  - computer picks, value labels, grades
  trades.py       - trade chart, offers, trading up and down
"""

import os
from datetime import datetime

from config import TEAMS_FILE, PLAYERS_FILE, ORDER_FILE, CHART_FILE, RESULTS_FOLDER
from data import load_teams, load_players, load_draft_order, load_trade_chart, save_results
from draft_logic import cpu_pick, value_label, LABEL_POINTS, show_grades
from trades import show_pick_values, trade_down_menu, trade_up_menu


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


def user_pick(team, available, pick, order, chart, user_teams):
    """Returns the player you draft, or None if you traded the pick away."""
    print(f"\n>>> You're on the clock: {team.name}")
    print(f"    Needs: {', '.join(team.needs) or 'none listed'}")
    show_need_hints(team, available)
    show_board(available)
    print("\nType a rank number to draft that player, a position (e.g. WR) to filter, 'more' to see more, or T to trade down.")
    while True:
        choice = input("Your pick: ").strip().upper()
        if choice == "MORE":
            show_board(available, count=50)
        elif choice == "T":
            if trade_down_menu(pick, team.name, order, chart, user_teams):
                return None
            show_board(available)
        elif choice.isdigit():
            match = next((p for p in available if p.rank == int(choice)), None)
            if match:
                return match
            print("That player isn't available.")
        elif choice:
            show_board(available, count=50, position=choice)


def run_draft(teams, players, order, rounds, user_teams, chart):
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
            if user_teams:
                for name in user_teams:
                    show_pick_values(name, order, chart)
                trade_up_menu(order, chart, user_teams, pick.number, rounds)
        if not available:
            print("No players left!")
            break

        team = by_name[pick.team]
        player = None
        if team.name in user_teams:
            player = user_pick(team, available, pick, order, chart, user_teams)
            team = by_name[pick.team]        # changes if you traded the pick away
        if player is None:
            player = cpu_pick(team, available)

        available.remove(player)
        team.picks.append(player)
        label = value_label(pick.number, player.rank)
        score = LABEL_POINTS[label]
        if player.position in team.needs:
            team.needs.remove(player.position)   # need filled
            score += 1                           # bonus point for filling a need
        team.scores.append(score)
        results.append((pick, player))

        via = f" (from {pick.from_team})" if pick.from_team else ""
        print(f"  {pick.number:>3}. {team.name + via:<40} {player.name} ({player.position}, {player.college})  [rank {player.rank}]  {label}")

    return results


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
    chart = load_trade_chart(CHART_FILE)
    print(f"Loaded {len(teams)} teams, {len(players)} prospects and {len(order)} picks.\n")

    qb_count = 0
    for p in players:
        if p.position == "QB":
            qb_count += 1
    print(f"QBs in this draft class: {qb_count}\n")

    user_teams = choose_user_teams(teams, order)
    rounds_raw = input("How many rounds? (1-7, default 1): ").strip()
    rounds = int(rounds_raw) if rounds_raw.isdigit() and 1 <= int(rounds_raw) <= 7 else 1

    results = run_draft(teams, players, order, rounds, user_teams, chart)

    os.makedirs(RESULTS_FOLDER, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    results_path = os.path.join(RESULTS_FOLDER, f"mock_{stamp}.csv")
    save_results(results, results_path)
    show_grades(teams, user_teams)

    for t in teams:
        if t.name in user_teams:
            print(f"\nYour draft class – {t.name}:")
            for p in t.picks:
                print(f"  {p.name} ({p.position}, {p.college})")
    print(f"\nFull results saved to {results_path}")


if __name__ == "__main__":
    main()
