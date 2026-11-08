"""
Saves the simulator's data as JSON files for the website.

Run from the mockdraft folder:  python3 export_json.py
Re-run it any time you change a CSV file, then upload docs/data to GitHub.

players.json also gets each prospect's college stats (prospect_stats.csv),
birth date and draft-day age (prospect_ages.csv) and average draft position
(adp.csv), when those files have him.

sims.json has the 1,000-draft results for the website's "1,000 drafts" page:
the most common picks at every slot and the position runs (from auto_mocks.py --save).
"""

import csv
import json
import os

from config import TEAMS_FILE, PLAYERS_FILE, ORDER_FILE, CHART_FILE

# extra details for the player cards (optional: the export still works without them)
STATS_FILE = "prospect_stats.csv"
AGES_FILE = "prospect_ages.csv"
ADP_FILE = "adp.csv"
SIM_PICKS_FILE = "sim_picks.csv"
SIM_POSITIONS_FILE = "sim_positions.csv"

# stat columns in prospect_stats.csv, in the order the website shows them
STAT_COLUMNS = ["games",
                "pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int",
                "rush_att", "rush_yds", "rush_td",
                "rec", "rec_yds", "rec_td",
                "tackles", "tfl", "sacks", "def_int", "pass_breakups"]

# the website lives in the docs folder next to this mockdraft folder
OUTPUT_FOLDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "data"))


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def number(text):
    """'1,243' -> 1243, '8.5' -> 8.5, '' -> None"""
    text = (text or "").replace(",", "").strip()
    if not text:
        return None
    value = float(text)
    return int(value) if value.is_integer() else value


def read_extra(path):
    """rows of an optional CSV, by player name ({} if the file isn't there)"""
    if not os.path.exists(path):
        print(f"  (no {path}, skipping it)")
        return {}
    return {row["name"].strip(): row for row in read_csv(path)}


def add_details(players):
    """put college stats and draft-day age on each player who has them"""
    stats = read_extra(STATS_FILE)
    ages = read_extra(AGES_FILE)
    adp = read_extra(ADP_FILE)
    with_stats = with_age = 0
    for p in players:
        row = stats.get(p["name"])
        if row:
            numbers = {col: number(row.get(col)) for col in STAT_COLUMNS}
            numbers = {col: v for col, v in numbers.items() if v is not None}
            if numbers:
                p["stats"] = {"season": int(row.get("season") or 2025), **numbers}
                if row.get("note", "").strip():
                    p["stats"]["note"] = row["note"].strip()
                with_stats += 1
        row = adp.get(p["name"])
        if row:
            p["adp"] = {"pct": number(row["drafted_pct"])}
            if row.get("avg_pick", "").strip():
                p["adp"].update(avg=number(row["avg_pick"]), min=number(row["earliest"]),
                                max=number(row["latest"]), team=row["top_team"],
                                teamPct=number(row["top_team_pct"]))
        row = ages.get(p["name"])
        if row and row.get("birth_date", "").strip():
            p["born"] = row["birth_date"].strip()
            p["age"] = number(row["age_on_draft_day"])
            with_age += 1

    # after a new big board, list top-100 players these files don't cover yet
    top = [p["name"] for p in players if p["rank"] <= 100]
    print(f"  stats for {with_stats} players, ages for {with_age}")
    for label, table in (("stats", stats), ("ages", ages)):
        missing = [name for name in top if table and name not in table]
        if missing:
            print(f"  top-100 players not in the {label} file yet: {', '.join(missing)}")


def sims_data():
    """the 1,000-draft results, or None if auto_mocks.py --save hasn't been run"""
    if not (os.path.exists(SIM_PICKS_FILE) and os.path.exists(SIM_POSITIONS_FILE)):
        print(f"  (no {SIM_PICKS_FILE} / {SIM_POSITIONS_FILE}: run python3 auto_mocks.py 1000 --save)")
        return None
    picks = read_csv(SIM_PICKS_FILE)
    slots = []
    for row in picks:
        top = [[row[f"player{i}"], row[f"pos{i}"], number(row[f"pct{i}"])]
               for i in (1, 2, 3) if row.get(f"player{i}", "").strip()]
        slots.append({"pick": int(row["pick"]), "round": int(row["round"]), "team": row["team"], "top": top})
    positions = []
    for row in read_csv(SIM_POSITIONS_FILE):
        rounds = [number(row[k]) for k in sorted(row) if k.startswith("round")]
        off = [number(row[k]) for k in ("first_off", "second_off", "third_off")]
        positions.append({"pos": row["position"], "rounds": rounds, "off": off})
    return {"sims": int(picks[0]["sims"]), "slots": slots, "positions": positions}


def save(name, data):
    path = os.path.join(OUTPUT_FOLDER, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"  {path}  ({len(data)} items)")


def main():
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    print("Saved:")

    players = [
        {
            "rank": int(row["rank"]),
            "name": row["name"].strip(),
            "position": row["position"].strip().upper(),
            "college": row["college"].strip(),
            "height": row.get("height", ""),
            "weight": row.get("weight", ""),
            "year": row.get("year", ""),
        }
        for row in read_csv(PLAYERS_FILE)
    ]
    players.sort(key=lambda p: p["rank"])
    add_details(players)
    save("players.json", players)

    teams = [
        {"name": row["team"].strip(),
         "needs": [n.strip().upper() for n in row["needs"].split("|") if n.strip()]}
        for row in read_csv(TEAMS_FILE)
    ]
    save("teams.json", teams)

    order = [
        {"round": int(row["round"]), "pick": int(row["pick"]),
         "team": row["team"].strip(), "from": row.get("from", "").strip()}
        for row in read_csv(ORDER_FILE)
    ]
    order.sort(key=lambda p: p["pick"])
    save("draft_order.json", order)

    chart = {row["pick"]: float(row["value"]) for row in read_csv(CHART_FILE)}
    save("trade_chart.json", chart)

    sims = sims_data()
    if sims:
        save("sims.json", sims)


if __name__ == "__main__":
    main()
