"""
Saves the simulator's data as JSON files for the website.

Run from the mockdraft folder:  python3 export_json.py
Re-run it any time you change a CSV file, then upload docs/data to GitHub.
"""

import csv
import json
import os

from config import TEAMS_FILE, PLAYERS_FILE, ORDER_FILE, CHART_FILE

# the website lives in the docs folder next to this mockdraft folder
OUTPUT_FOLDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "data"))


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


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


if __name__ == "__main__":
    main()
