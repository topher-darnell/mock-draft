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

# Pick value labels
VALUE_MIN_MARGIN = 3            # cushion (in spots) for early picks
VALUE_MARGIN_RATE = 0.12        # cushion for later picks, as a share of the pick number

# Trades
TRADE_UP_PREMIUM = 1.05         # moving up costs 5% more than the pick is worth
TRADE_WINDOW = 15               # teams within this many picks of you make offers
