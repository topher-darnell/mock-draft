"""
Prints the numbers for the weekly email, and saves this week's snapshot so next week
can show who moved.

    python3 weekly_summary.py

Run it after auto_mocks.py --save, export_json.py and build_pages.py. It reads
docs/data/players.json, docs/data/sims.json, sim_first.csv and market_odds.csv, compares
each player's average pick with the most recent snapshot in history/, and writes
history/<today>.json.
"""

import csv
import datetime
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "docs", "data")
HISTORY = os.path.join(HERE, "history")


def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


def main():
    players = load("players.json")
    sims = load("sims.json")
    by_name = {p["name"]: p for p in players}
    today = datetime.date.today().isoformat()

    print("TOP 10 (most common pick at each slot)")
    for s in sims["slots"][:10]:
        name, pos, pct = s["top"][0]
        alt = s["top"][1] if len(s["top"]) > 1 else None
        p = by_name.get(name, {})
        extra = f"  | next: {alt[0]} {round(alt[2])}%" if alt else ""
        print(f"  {s['pick']:>2} {s['team']}: {name}, {pos}, {p.get('college', '')} ({round(pct)}%){extra}")

    print("\nWHO GOES #1 (our sims)")
    for r in list(csv.DictReader(open(os.path.join(HERE, "sim_first.csv"))))[:5]:
        print(f"  {r['name']} {r['position']}: {float(r['pct']):.0f}%")
    print("WHO GOES #1 (market_odds.csv, typed in by hand)")
    for r in csv.DictReader(open(os.path.join(HERE, "market_odds.csv"))):
        print(f"  {r['book']} {r['as_of']}: {r['name']} {r['odds'] or r['prob'] + '%'}")

    adp = {p["name"]: p["adp"]["avg"] for p in players if p.get("adp") and p["adp"].get("avg")}
    rank = {p["name"]: p["rank"] for p in players}
    earlier = sorted(f for f in glob.glob(os.path.join(HISTORY, "*.json")) if os.path.basename(f) < f"{today}.json")
    if earlier:
        before = json.load(open(earlier[-1]))
        moves = [(adp[n] - before["adp"][n], n) for n in adp if n in before["adp"] and rank[n] <= 100]
        moves.sort()
        print(f"\nRISERS since {os.path.basename(earlier[-1])[:-5]} (average pick got earlier)")
        for d, n in moves[:5]:
            print(f"  {n} {by_name[n]['position']}, {by_name[n]['college']}: {before['adp'][n]:.1f} -> {adp[n]:.1f}")
        print("FALLERS (average pick got later)")
        for d, n in moves[-5:][::-1]:
            print(f"  {n} {by_name[n]['position']}, {by_name[n]['college']}: {before['adp'][n]:.1f} -> {adp[n]:.1f}")
    else:
        print("\nNo earlier snapshot yet: compare average pick with big-board rank instead")
        gaps = sorted((rank[n] - a, n) for n, a in adp.items() if rank[n] <= 64)
        print("  GMs take earlier than ranked:", ", ".join(f"{n} (#{rank[n]}, avg {adp[n]:.1f})" for _, n in gaps[-4:][::-1]))
        print("  Lasting longer than ranked:", ", ".join(f"{n} (#{rank[n]}, avg {adp[n]:.1f})" for _, n in gaps[:4]))

    os.makedirs(HISTORY, exist_ok=True)
    snap = {"date": today, "adp": adp,
            "top10": [[s["pick"], s["team"], s["top"][0][0], s["top"][0][2]] for s in sims["slots"][:10]]}
    with open(os.path.join(HISTORY, f"{today}.json"), "w") as f:
        json.dump(snap, f)
    print(f"\nSaved history/{today}.json")


if __name__ == "__main__":
    main()
