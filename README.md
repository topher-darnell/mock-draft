# NFL Mock Draft Simulator

A 2027 NFL mock draft simulator you play in the terminal. You draft for one or more teams, and the computer drafts for everyone else using a real big board, the real draft order and each team's needs.

## Features

- **Real 2027 data:** 361 prospects, all 257 picks in the current draft order (traded and compensatory picks included), and the top needs for every team
- **Smart computer teams:** they balance best player available against team needs, with some randomness so no two mocks are the same
- **Pick labels:** every pick is tagged STEAL, Value, Fair or Reach by comparing where the player went to his big board rank
- **Draft grades:** every team gets a letter grade at the end, based on pick value and needs filled
- **Trades:** trade down when you're on the clock, or trade up at the start of a round, priced with a draft value chart
- **Saved mocks:** every draft is saved to the `mocks` folder with the date and time

## How to run it

You need Python 3.

```
cd mockdraft
python3 mock_draft.py
```

Then:

1. Choose your team (or press Enter to watch the computer draft) and how many rounds (1–7).
2. At the start of each round, type a pick number to try trading up, or press Enter.
3. When you're on the clock:
   - type a **rank number** to draft that player
   - type a **position** (like `WR` or `EDGE`) to filter the board
   - type `more` to see more players
   - type `T` to see trade-down offers

## Files

| File | What it does |
|---|---|
| `mock_draft.py` | Runs the draft (run this one) |
| `config.py` | Settings you can tweak, like how random the computer is |
| `models.py` | Player, Team and Pick |
| `data.py` | Loads the CSV files and saves results |
| `draft_logic.py` | Computer picks, value labels and grades |
| `trades.py` | Pick values and trades |
| `convert_board.py` | Rebuilds `players.csv` from a new PFN big board export |
| `players.csv` | Prospects: rank, name, position, college |
| `teams.csv` | Each team's needs, most important first |
| `draft_order.csv` | Every pick: round, pick number, team, original team |
| `trade_chart.csv` | Point value of every pick, modeled on the Jimmy Johnson chart |

## Data sources

- Big board: Pro Football Network consensus board
- Draft order: Tankathon
- Team needs: NFL.com

Data was last updated November 2026. Rankings and the draft order change every week, so mocks reflect the season so far.
