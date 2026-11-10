"""
Runs many computer-only mock drafts and prints a summary, so you can spot
picks that don't look realistic and tune config.py.

Run:  python3 auto_mocks.py              (10 drafts, 7 rounds)
      python3 auto_mocks.py 100          (100 drafts)
      python3 auto_mocks.py 1000 --save  (1,000 drafts, and save adp.csv)

--save writes five files that export_json.py and build_pages.py send to the website:
  adp.csv           each player's average draft position (ADP): average, earliest
                    and latest pick, how often he got drafted, and the team that
                    took him most often
  sim_picks.csv     every pick slot: the three players taken there most often
  sim_positions.csv each position: how many go per round on average, and the
                    average pick of the 1st, 2nd and 3rd one taken (position runs)
  sim_first.csv     everyone who went #1 overall, and how often (for the odds page)
  sim_teams.csv     each team: the ten players it drafted most often
"""

import contextlib
import csv
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


ADP_FILE = "adp.csv"
PICKS_FILE = "sim_picks.csv"
POSITIONS_FILE = "sim_positions.csv"
FIRST_FILE = "sim_first.csv"
TEAMS_SIM_FILE = "sim_teams.csv"


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def save_slots(sims, slots):
    """slots: pick number -> (round, team, Counter of (name, position))"""
    rows = []
    for number in sorted(slots):
        rnd, team, counts = slots[number]
        row = {"pick": number, "round": rnd, "team": team, "sims": sims}
        top = counts.most_common(3)
        for i in range(3):
            name, pos = top[i][0] if i < len(top) else ("", "")
            row[f"player{i + 1}"] = name
            row[f"pos{i + 1}"] = pos
            row[f"pct{i + 1}"] = round(100 * top[i][1] / sims, 1) if i < len(top) else ""
        rows.append(row)
    write_csv(PICKS_FILE, rows)
    print(f"Saved {PICKS_FILE}: {len(rows)} pick slots")


def save_first(sims, slots):
    """everyone taken with the first pick, most often first"""
    rnd, team, counts = slots[1]
    rows = [{"team": team, "name": name, "position": pos, "pct": round(100 * n / sims, 1)}
            for (name, pos), n in counts.most_common()]
    write_csv(FIRST_FILE, rows)
    print(f"Saved {FIRST_FILE}: {len(rows)} players went #1")


def save_team_favorites(sims, teams_by_player, positions):
    """each team's ten most-drafted players (any round)"""
    by_team = defaultdict(Counter)
    for name, teams in teams_by_player.items():
        for team, n in teams.items():
            by_team[team][name] = n
    rows = []
    for team in sorted(by_team):
        for name, n in by_team[team].most_common(10):
            rows.append({"team": team, "name": name, "position": positions[name], "pct": round(100 * n / sims, 1)})
    write_csv(TEAMS_SIM_FILE, rows)
    print(f"Saved {TEAMS_SIM_FILE}: {len(rows)} rows")


def save_positions(sims, rounds, per_round, nth_off):
    """per_round: position -> Counter(round -> players taken in all sims)
    nth_off: position -> list of [pick numbers of the 1st, 2nd, 3rd taken, per draft]"""
    rows = []
    for pos in sorted(per_round, key=lambda p: -sum(per_round[p].values())):
        row = {"position": pos}
        for r in range(1, rounds + 1):
            row[f"round{r}"] = round(per_round[pos][r] / sims, 2)
        for k, label in enumerate(["first", "second", "third"]):
            picks = nth_off[pos][k]
            row[f"{label}_off"] = round(sum(picks) / len(picks), 1) if picks else ""
        rows.append(row)
    write_csv(POSITIONS_FILE, rows)
    print(f"Saved {POSITIONS_FILE}: {len(rows)} positions")


def save_adp(sims, rounds, picks_by_player, teams_by_player, players):
    """one row per player on the board, best rank first"""
    rows = []
    for p in sorted(players, key=lambda p: p.rank):
        spots = picks_by_player.get(p.name, [])
        row = {"rank": p.rank, "name": p.name, "position": p.position, "college": p.college,
               "drafted_pct": round(100 * len(spots) / sims, 1),
               "avg_pick": "", "earliest": "", "latest": "", "top_team": "", "top_team_pct": ""}
        if spots:
            team, count = teams_by_player[p.name].most_common(1)[0]
            row.update(avg_pick=round(sum(spots) / len(spots), 1), earliest=min(spots), latest=max(spots),
                       top_team=team, top_team_pct=round(100 * count / len(spots), 1))
        rows.append(row)
    write_csv(ADP_FILE, rows)
    print(f"\nSaved {ADP_FILE}: {len(rows)} players from {sims} drafts ({rounds} rounds each)")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sims = int(args[0]) if args else 10
    save = "--save" in sys.argv
    rounds = 7

    picks_by_player = defaultdict(list)    # player name -> every pick number he went at
    teams_by_player = defaultdict(Counter) # player name -> how often each team took him
    slots = {}                             # pick number -> (round, team, Counter of players)
    per_round = defaultdict(Counter)       # position -> round -> players taken
    nth_off = defaultdict(lambda: [[], [], []])
    rank_of = {}
    position_of = {}
    r1_positions = Counter()
    qbs_in_r1 = []

    for _ in range(sims):
        results = one_draft(rounds)
        qbs = 0
        seen = Counter()
        for pick, player in results:
            slots.setdefault(pick.number, (pick.round, pick.team, Counter()))[2][(player.name, player.position)] += 1
            per_round[player.position][pick.round] += 1
            if seen[player.position] < 3:
                nth_off[player.position][seen[player.position]].append(pick.number)
            seen[player.position] += 1
            picks_by_player[player.name].append(pick.number)
            teams_by_player[player.name][pick.team] += 1
            rank_of[player.name] = player.rank
            position_of[player.name] = player.position
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

    if save:
        save_adp(sims, rounds, picks_by_player, teams_by_player, load_players(PLAYERS_FILE))
        save_slots(sims, slots)
        save_positions(sims, rounds, per_round, nth_off)
        save_first(sims, slots)
        save_team_favorites(sims, teams_by_player, position_of)


if __name__ == "__main__":
    main()
