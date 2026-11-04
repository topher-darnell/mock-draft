"""Pick values, trade offers, and trading up or down."""

from config import TRADE_UP_PREMIUM, TRADE_WINDOW


def show_pick_values(team_name, order, chart):
    mine = [p for p in order if p.team == team_name]
    print(f"\n{team_name} picks:")
    for p in mine:
        print(f"  Round {p.round}, pick {p.number:>3}   {chart[p.number]:>6.0f} points")
    total = sum(chart[p.number] for p in mine)
    print(f"  Total draft capital: {total:.0f} points")


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


def make_trade(pick, my_team, other_team, package):
    """Send `pick` from my_team to other_team, and `package` the other way."""
    pick.from_team = pick.from_team or my_team
    pick.team = other_team
    for p in package:
        p.from_team = p.from_team or other_team
        p.team = my_team


def find_trade_offers(pick, order, chart, user_teams, max_offers=3):
    """Teams picking soon after you offer their pick plus whatever extra
    picks it takes to match the value of yours."""
    my_value = chart[pick.number]
    offers = []
    seen = set()
    for p in order:
        if p.number <= pick.number:
            continue
        if p.number > pick.number + TRADE_WINDOW:   # only teams picking soon after you
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


def trade_down_menu(pick, team_name, order, chart, user_teams):
    """Shown when you type T on the clock. Returns True if you traded the pick."""
    offers = find_trade_offers(pick, order, chart, user_teams)
    if not offers:
        print("No teams want to trade up right now.")
        return False
    my_value = chart[pick.number]
    print(f"\nYour pick #{pick.number} is worth {my_value:.0f} points. Offers:")
    for i, (other, package, total) in enumerate(offers, 1):
        picks_text = ", ".join(f"#{p.number}" for p in package)
        print(f"  {i}. {other}: picks {picks_text}  ({total:.0f} points, {total - my_value:+.0f})")
    answer = input("Type an offer number to accept, or press Enter to keep your pick: ").strip()
    if answer.isdigit() and 1 <= int(answer) <= len(offers):
        other, package, total = offers[int(answer) - 1]
        make_trade(pick, team_name, other, package)
        print(f"\n*** TRADE: {team_name} sends #{pick.number} to {other} for picks "
              f"{', '.join('#' + str(p.number) for p in package)} ***")
        return True
    return False


def trade_up_menu(order, chart, user_teams, first_open_pick, rounds):
    """Shown at the start of each round."""
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
