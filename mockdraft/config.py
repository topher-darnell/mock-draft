"""Settings you can tweak. Change a number, save, and run a new mock."""

# Data files
TEAMS_FILE = "teams.csv"
PLAYERS_FILE = "players.csv"
ORDER_FILE = "draft_order.csv"
CHART_FILE = "trade_chart.csv"
RESULTS_FOLDER = "mocks"

# How the computer drafts
NEED_BONUS = [8, 6, 4, 3, 2]   # bonus (in "rank spots") for top need, 2nd need, ...
RANDOMNESS = 7                  # max random swing in rank spots; higher = wilder drafts
LOOK_AHEAD = 15                 # CPU only considers this many best-available players

# Teams with an established starting QB: no QB in rounds 1-3, and rarely a backup later.
# Update this list when a team's QB situation changes (it's also in docs/app.js as FRANCHISE_QB).
FRANCHISE_QB = {
    "Baltimore Ravens",
    "Buffalo Bills",
    "Carolina Panthers",
    "Chicago Bears",
    "Cincinnati Bengals",
    "Dallas Cowboys",
    "Denver Broncos",
    "Detroit Lions",
    "Green Bay Packers",
    "Houston Texans",
    "Jacksonville Jaguars",
    "Kansas City Chiefs",
    "Los Angeles Chargers",
    "New England Patriots",
    "New York Giants",
    "Philadelphia Eagles",
    "San Francisco 49ers",
    "Tennessee Titans",
    "Washington Commanders",
}
QB_PENALTY = {1: 1000, 2: 1000, 3: 1000, 4: 60, 5: 60, 6: 25, 7: 25}   # by round, in rank spots

def stack_penalty(position, already, pick_number):
    """penalty (in rank spots) for taking another player at a position the team already drafted"""
    if not already:
        return 0
    return (10 + 0.3 * pick_number) * already * (4 if position == "QB" else 1)

# Pick value labels
VALUE_MIN_MARGIN = 3            # cushion (in spots) for early picks
VALUE_MARGIN_RATE = 0.12        # cushion for later picks, as a share of the pick number

# Trades
TRADE_UP_PREMIUM = 1.05         # moving up costs 5% more than the pick is worth
TRADE_WINDOW = 15               # teams within this many picks of you make offers
