"""
NFL Mock Draft Simulator
------------------------
You draft for one (or more) teams; the computer drafts for everyone else.

Data files (edit these freely):
  teams.csv        -> team,needs          (needs separated by "|", most important first)
  players.csv      -> rank,name,position,college,...
  draft_order.csv  -> round,pick,team,from   (one row per pick, so traded picks work)
  trade_chart.csv  -> pick,value             (points per pick, used for trades)

Run:  python3 mock_draft.py

When you're on the clock, type T to see trade-down offers.
At the start of each round, type a pick number to try trading up to it.
"""

import csv
from datetime import datetime
import os
import random
from dataclasses import dataclass, field

TEAMS_FILE = "teams.csv"
PLAYERS_FILE = "players.csv"
ORDER_FILE = "draft_order.csv"
RESULTS_FOLDER = "mocks"
CHART_FILE = "trade_chart.csv"

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
    scores: list = field(default_factory=list)


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


def load_trade_chart(path):
    chart = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            chart[int(row["pick"])] = float(row["value"])
    return chart


def show_pick_values(team_name, order, chart):
    mine = [p for p in order if p.team == team_name]
    print(f"\n{team_name} picks:")
    for p in mine:
        print(f"  Round {p.round}, pick {p.number:>3}   {chart[p.number]:>6.0f} points")
    total = sum(chart[p.number] for p in mine)
    print(f"  Total draft capital: {total:.0f} points")


TRADE_UP_PREMIUM = 1.05   # moving up costs 5% more than the pick is worth


def build_package(pool, needed, chart):
    """Pick from `pool` until the total reaches `needed`, using the smallest
    pick that closes the gap so nobody overpays by much."""
    pool = list(pool)
    package = []
    total = 0
    while total < needed and pool:
        gap = needed - total
        closers = [p for p in pool if chart[p.number] >= gap]
        if closers:
            extra = min(closers, key=lambda p: chart[p.number])
        else:
            extra = max(pool, key=lambda p: chart[p.number])
        package.append(extra)
        pool.remove(extra)
        total += chart[extra.number]
    return package, total


def find_trade_offers(pick, order, chart, user_teams, max_offers=3):
    """Teams picking soon after you offer their pick plus whatever extra
    picks it takes to match the value of yours."""
    my_value = chart[pick.number]
    offers = []
    seen = set()
    for p in order:
        if p.number <= pick.number:
            continue
        if p.number > pick.number + 15:          # only teams picking soon after you
            break
        if p.team in user_teams or p.team in seen:
            continue
        seen.add(p.team)
        their_other_picks = [x for x in order if x.team == p.team and x.number > p.number]
        extras, extra_total = build_package(their_other_picks, my_value - chart[p.number], chart)
        total = chart[p.number] + extra_total
        if total >= my_value:
            offers.append((p.team, [p] + extras, total))
        if len(offers) == max_offers:
            break
    return offers


def trade_up_menu(order, chart, user_teams, first_open_pick, rounds):
    while True:
        answer = input("\nType a pick number to trade up to it, or press Enter to keep drafting: ").strip()
        if not answer:
            return
        if not answer.isdigit():
            continue
        target = next((p for p in order if p.number == int(answer)), None)
        if target is None or target.number < first_open_pick or target.round > rounds:
            print("That pick isn't available.")
            continue
        if target.team in user_teams:
            print("You already own that pick.")
            continue

        # use the team (of yours) that has the earliest pick after the target
        my_later = [p for p in order if p.team in user_teams and p.number > target.number]
        if not my_later:
            print("You don't have any picks after that one to trade.")
            continue
        me = my_later[0].team
        my_pool = [p for p in my_later if p.team == me]

        cost = chart[target.number] * TRADE_UP_PREMIUM
        package, total = build_package(my_pool, cost, chart)
        if total < cost:
            print(f"You don't have enough picks to move up to #{target.number}.")
            continue

        picks_text = ", ".join(f"#{p.number}" for p in package)
        print(f"{target.team} will trade #{target.number} ({chart[target.number]:.0f} points) "
              f"for {picks_text} ({total:.0f} points)")
        if input("Accept? (y/n): ").strip().lower() == "y":
            other = target.team
            make_trade(target, other, me, package)
            print(f"\n*** TRADE: {me} moves up to #{target.number}, sending {picks_text} to {other} ***")


def make_trade(pick, my_team, other_team, package):
    pick.from_team = pick.from_team or my_team
    pick.team = other_team
    for p in package:
        p.from_team = p.from_team or other_team
        p.team = my_team


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


def value_label(pick_number, rank):
    diff = pick_number - rank                  # positive = player fell to you
    margin = max(3, round(pick_number * 0.12)) # later picks get a bigger cushion
    if diff >= margin * 2:
        return "STEAL"
    elif diff >= margin:
        return "Value"
    elif diff > -margin:
        return "Fair"
    else:
        return "Reach"


LABEL_POINTS = {"STEAL": 3, "Value": 2, "Fair": 1, "Reach": 0}


def average(scores):
    return sum(scores) / len(scores)


def show_grades(teams, user_teams):
    # Grade on a curve: rank teams by average points per pick, best first
    graded = [t for t in teams if t.scores]
    graded.sort(key=lambda t: average(t.scores), reverse=True)

    grades = {}
    for i, t in enumerate(graded):
        spot = i / len(graded)        # 0.0 = best team, close to 1.0 = worst
        if spot < 0.20:
            grades[t.name] = "A"
        elif spot < 0.45:
            grades[t.name] = "B"
        elif spot < 0.75:
            grades[t.name] = "C"
        elif spot < 0.92:
            grades[t.name] = "D"
        else:
            grades[t.name] = "F"

    print("\n========== DRAFT GRADES ==========")
    for t in graded:
        if t.name in user_teams:
            print(f"  YOUR GRADE: {t.name}  {grades[t.name]}  ({average(t.scores):.2f} points per pick)\n")
    for t in graded:
        marker = "  <-- you" if t.name in user_teams else ""
        print(f"  {grades[t.name]}  {t.name:<24} {average(t.scores):.2f}  ({len(t.scores)} picks){marker}")


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
            offers = find_trade_offers(pick, order, chart, user_teams)
            if not offers:
                print("No teams want to trade up right now.")
                continue
            my_value = chart[pick.number]
            print(f"\nYour pick #{pick.number} is worth {my_value:.0f} points. Offers:")
            for i, (other, package, total) in enumerate(offers, 1):
                picks_text = ", ".join(f"#{p.number}" for p in package)
                print(f"  {i}. {other}: picks {picks_text}  ({total:.0f} points, {total - my_value:+.0f})")
            answer = input("Type an offer number to accept, or press Enter to keep your pick: ").strip()
            if answer.isdigit() and 1 <= int(answer) <= len(offers):
                other, package, total = offers[int(answer) - 1]
                make_trade(pick, team.name, other, package)
                print(f"\n*** TRADE: {team.name} sends #{pick.number} to {other} for picks "
                      f"{', '.join('#' + str(p.number) for p in package)} ***")
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
    chart = load_trade_chart(CHART_FILE)
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
