"""
Runs many computer-only mock drafts and prints a summary, so you can spot
picks that don't look realistic and tune config.py.

Run:  python3 auto_mocks.py          (10 drafts, 7 rounds)
      python3 auto_mocks.py 100      (100 drafts)
"""

import contextlib
import io
import sys
from collections import Counter, defaultdict

from config import TEAMS_FILE, PLAYERS_FILE, ORDER_FILE, CHART_FILE
from data import load_teams, load_players, load_draft_order, load_trade_chart
from mock_draft import run_draft


def one_draft(rounds):
    # load fresh data each time, since a draft changes team needs
    teams = load_teams(TEAMS_FILE)
    players = load_players(PLAYERS_FILE)
    order = load_draft_order(ORDER_FILE, teams)
    chart = load_trade_chart(CHART_FILE)
    with contextlib.redirect_stdout(io.StringIO()):   # hide the pick-by-pick output
        return run_draft(teams, players, order, rounds, set(), chart)


def main():
    sims = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    rounds = 7

    picks_by_player = defaultdict(list)    # player name -> every pick number he went at
    rank_of = {}
    r1_positions = Counter()
    qbs_in_r1 = []

    for _ in range(sims):
        results = one_draft(rounds)
        qbs = 0
        for pick, player in results:
            picks_by_player[player.name].append(pick.number)
            rank_of[player.name] = player.rank
            if pick.round == 1:
                r1_positions[player.position] += 1
                if player.position == "QB":
                    qbs += 1
        qbs_in_r1.append(qbs)

    print(f"Ran {sims} computer-only drafts ({rounds} rounds each)\n")

    print(f"QBs taken in round 1: average {sum(qbs_in_r1) / sims:.1f}, "
          f"fewest {min(qbs_in_r1)}, most {max(qbs_in_r1)}")

    print("\nRound 1 picks by position (average per draft):")
    for pos, count in r1_positions.most_common():
        print(f"  {pos:<5} {count / sims:.1f}")

    print("\nTop 15 prospects: where they went")
    print(f"  {'Rank':>4}  {'Player':<24} {'Avg pick':>8}  Range")
    for name, rank in sorted(rank_of.items(), key=lambda x: x[1])[:15]:
        spots = picks_by_player[name]
        print(f"  {rank:>4}  {name:<24} {sum(spots) / len(spots):>8.1f}  {min(spots)}-{max(spots)}")

    print("\nBiggest fallers (average pick vs. board rank, top 100 players):")
    falls = []
    for name, rank in rank_of.items():
        if rank <= 100:
            avg = sum(picks_by_player[name]) / len(picks_by_player[name])
            falls.append((avg - rank, name, rank, avg))
    for fall, name, rank, avg in sorted(falls, reverse=True)[:5]:
        print(f"  #{rank:<4} {name:<24} goes {avg:.0f} on average ({fall:+.0f})")


if __name__ == "__main__":
    main()
