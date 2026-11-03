"""
Turns a PFN big board export (.json) into players.csv for mock_draft.py.

Run:  python convert_board.py pfn-consensus-2026-11-03.json
Re-run it any time you download a newer board.
"""

import csv
import json
import sys

# PFN position labels -> the labels the simulator (and teams.csv) use
POSITION_MAP = {
    "DT": "IDL",
    "SAF": "S",
    "NB": "CB",     # nickel corners count as CB
    "OC": "C",      # center
    "OL": "OG",     # unspecified O-linemen treated as guards
}


def clean_position(raw):
    first = raw.split("/")[0].strip().upper()   # "DT/EDGE" -> "DT"
    return POSITION_MAP.get(first, first)


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert_board.py <board.json>")
        return

    with open(sys.argv[1], encoding="utf-8") as f:
        board = json.load(f)

    board.sort(key=lambda p: p["rank"])
    with open("players.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "name", "position", "college", "height", "weight", "year"])
        for p in board:
            w.writerow([p["rank"], p["name"], clean_position(p["position"]), p["school"],
                        p.get("height", ""), p.get("weight", ""), p.get("year", "")])

    print(f"Wrote {len(board)} players to players.csv")


if __name__ == "__main__":
    main()
