"""How the computer picks, how picks are labeled, and how drafts are graded."""

import random

from config import NEED_BONUS, RANDOMNESS, LOOK_AHEAD, VALUE_MIN_MARGIN, VALUE_MARGIN_RATE

LABEL_POINTS = {"STEAL": 3, "Value": 2, "Fair": 1, "Reach": 0}


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
    diff = pick_number - rank                                              # positive = player fell to you
    margin = max(VALUE_MIN_MARGIN, round(pick_number * VALUE_MARGIN_RATE))  # later picks get a bigger cushion
    if diff >= margin * 2:
        return "STEAL"
    elif diff >= margin:
        return "Value"
    elif diff > -margin:
        return "Fair"
    else:
        return "Reach"


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
