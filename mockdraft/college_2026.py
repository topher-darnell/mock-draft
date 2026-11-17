"""
2026 college stats for our prospects, from Sports Reference exports in sr/
(Share & Export -> Get table as CSV on the 2026 passing / rushing / receiving / defense pages).

    python3 college_2026.py      writes prospect_stats_2026.csv (same columns as prospect_stats.csv)

Matching: by name, and the school must match too when we know it. Run it again any time
you drop in newer exports; export_json.py shows 2026 when a player has it, 2025 otherwise.
"""
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SR = os.path.join(HERE, "sr")
OUT = os.path.join(HERE, "prospect_stats_2026.csv")
COLS = ["rank", "name", "position", "college", "season", "games", "pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int",
        "rush_att", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "tackles", "tfl", "sacks", "def_int", "pass_breakups", "source", "note"]
SCHOOL = {"texas christian": "tcu", "north carolina state": "nc state", "southern california": "usc", "louisiana state": "lsu",
          "central florida": "ucf", "brigham young": "byu", "southern methodist": "smu", "mississippi": "ole miss",
          "pittsburgh": "pitt", "miami (fl)": "miami (fl)", "texas-san antonio": "utsa", "alabama-birmingham": "uab"}


def key(name):
    n = name.lower().replace(".", "").replace("'", "").replace("’", "")
    n = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", n)
    return re.sub(r"[^a-z]+", " ", n).strip()


def school(s):
    s = (s or "").strip().lower()
    return SCHOOL.get(s, s)


def table(path):
    """rows of a Sports Reference CSV (header row is the one starting with Rk); repeated
    column names (two 'Yds', two 'TD') get the group name from the row above"""
    if not os.path.exists(path):
        return []
    rows = list(csv.reader(open(path, encoding="utf-8", errors="replace")))
    h = next(i for i, r in enumerate(rows) if r and r[0] == "Rk")
    groups = rows[h - 1] if h and rows[h - 1] and rows[h - 1][0] == "" else [""] * len(rows[h])
    names = [(g + " " + c).strip() if g else c for g, c in zip(groups + [""] * len(rows[h]), rows[h])]
    out = []
    for r in rows[h + 1:]:
        if len(r) < 5 or not r[0].strip() or r[0] == "Rk":
            continue
        out.append(dict(zip(names, r)))
    return out


def num(v):
    v = (v or "").replace(",", "").strip()
    try:
        x = float(v)
        return str(int(x)) if x.is_integer() else str(x)
    except ValueError:
        return ""


def main():
    players = list(csv.DictReader(open(os.path.join(HERE, "players.csv"), encoding="utf-8")))
    data = {}   # key(name) -> list of (school, dict of our columns)

    def put(r, cols):
        k = key(r["Player"])
        for sc, d in data.setdefault(k, []):
            if sc == school(r["Team"]):
                d.update({c: v for c, v in cols.items() if v != ""})
                d["games"] = max(d.get("games", ""), num(r["G"]), key=lambda x: float(x or 0))
                return
        data[k].append((school(r["Team"]), {"games": num(r["G"]), **{c: v for c, v in cols.items() if v != ""}}))

    for r in table(os.path.join(SR, "2026-passing.csv")):
        put(r, {"pass_cmp": num(r["Cmp"]), "pass_att": num(r["Att"]), "pass_yds": num(r["Yds"]), "pass_td": num(r["TD"]), "pass_int": num(r["Int"])})
    for f in ("2026-rushing.csv", "2026-receiving.csv"):
        for r in table(os.path.join(SR, f)):
            put(r, {"rush_att": num(r.get("Rushing Att")), "rush_yds": num(r.get("Rushing Yds")), "rush_td": num(r.get("Rushing TD")),
                    "rec": num(r.get("Receiving Rec")), "rec_yds": num(r.get("Receiving Yds")), "rec_td": num(r.get("Receiving TD"))})
    for r in table(os.path.join(SR, "2026-defense.csv")):
        g = lambda *ks: next((num(r[k]) for k in ks if k in r and num(r[k]) != ""), "")
        put(r, {"tackles": g("Tackles Tot", "Tot"), "tfl": g("Tackles Loss", "Loss", "TFL"), "sacks": g("Tackles Sk", "Sk"),
                "def_int": g("Def Int Int", "Int"), "pass_breakups": g("Def Int PD", "PD")})

    rows, missing = [], []
    for p in players:
        cands = data.get(key(p["name"]), [])
        hit = [d for sc, d in cands if sc == school(p["college"])] or (cands[0:1] and [cands[0][1]] if len(cands) == 1 else [])
        if not hit:
            missing.append(p)
            continue
        rows.append({"rank": p["rank"], "name": p["name"], "position": p["position"], "college": p["college"], "season": "2026",
                     **hit[0], "source": "Sports Reference", "note": ""})
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} prospects with 2026 stats, {len(missing)} without")
    return rows, missing


if __name__ == "__main__":
    rows, missing = main()
    by = {}
    for p in missing:
        by.setdefault(p["position"], []).append(p["name"])
    for pos, ns in by.items():
        print(f"  no 2026 stats: {pos} ({len(ns)}): {', '.join(ns[:12])}{' …' if len(ns) > 12 else ''}")
