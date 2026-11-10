# Big Head GM

**A free 2027 NFL mock draft simulator. Big heads. Big picks. Make your draft.**

▶ **Play it at [bigheadgm.com](https://bigheadgm.com)**, on your phone or computer. No sign-up.

![Big Head GM](docs/icons/og-image.jpg)

Pick a team, draft against 31 cartoon GMs who draft for their own needs, trade up or down, then see how your class grades out against the whole league.

## Features

- **Real 2027 data:** 361 prospects, all 257 picks in the current draft order (traded and compensatory picks included), and the top needs for every team
- **32 original GMs:** every team has its own big-headed 3D GM who reacts to your picks with five moods (smug, thinking, laughing, shocked and yelling) and a catchphrase
- **Smart computer teams:** they balance best player available against team needs, with some randomness so no two mocks are the same
- **Draft style:** a slider from Chalk to Chaos for how predictable the computer teams are, plus Slow to Instant pick speed
- **Pick labels:** every pick is tagged STEAL, Value, Fair or Reach by comparing where the player went to his big board rank
- **Player cards:** tap any player to see his rank, size, age on draft day, 2025 college stats, where he usually goes, the top players at his position and which teams need one next
- **Trades:** trade down when you're on the clock, or trade up before your pick, priced with a draft value chart
- **Grades:** every team gets a letter grade on a curve at the end
- **1,000 drafts:** a page with the consensus mock (the most common pick at every slot), when each position comes off the board, and every team's most likely picks. Every player's average draft position shows on the big board and his card
- **Player profiles:** a page for every prospect (`/players/`) with his rank, size, age, stats, draft projection and most likely team, plus a searchable big board
- **Team mock drafts:** a page for every team (`/teams/`) with its needs, every pick it holds, the most likely pick at each slot and the players it drafts most
- **#1 pick odds:** who goes first in the simulations, next to the latest sportsbook and prediction-market prices (`/odds.html`)
- **Games:** Draft Day Blitz, a daily swipe-to-draft challenge with rankings hidden, and Juke, an endless runner through 32 angry GMs (`/games/`)
- **Share my draft:** one tap makes a picture of your class and grade to text or post
- **My mocks:** your last 10 drafts are saved on your device
- **Works everywhere:** phone layout, a three-column draft room on computers, installable on your home screen, and works offline

## How the website works

The website is plain HTML, CSS and JavaScript in the `docs` folder, hosted free by GitHub Pages at bigheadgm.com.

| File | What it does |
|---|---|
| `docs/index.html` | The page: home, setup, draft room and grades screens |
| `docs/app.js` | The draft: computer picks, trades, grades, player cards, saved mocks, sharing |
| `docs/insights.html`, `docs/insights.js` | The "What 1,000 drafts say" page |
| `docs/gm.js` | Shows the right GM photo for each team and mood (and draws a cartoon backup if a photo can't load) |
| `docs/gm/` | The GM photos: one sheet per mood with all 32 teams, and one strip per team with all 5 moods |
| `docs/style.css` | How everything looks, on phones and computers |
| `docs/sw.js` | Saves the site on your device so it works offline |
| `docs/manifest.json` | Lets you add it to your home screen like an app |
| `docs/data/*.json` | Prospects (with college stats, ages and average draft position), teams, draft order, trade chart and the 1,000-draft results (made by `export_json.py`) |
| `docs/players/`, `docs/teams/`, `docs/odds.html` | Player profiles, team mock drafts and the #1 pick odds page. All made by `build_pages.py`, so don't edit them by hand |
| `docs/games/` | The games hub, Draft Day Blitz (`blitz.js`) and Juke (`juke.js`) |
| `docs/site.js` | Shared code for those pages: GM photos, the big board's search and filters |
| `docs/sitemap.xml`, `docs/robots.txt` | The list of pages for Google (made by `build_pages.py`) |
| `docs/icons/` | Logo, mascot, home screen icons and the link preview image |
| `docs/CNAME` | Connects the site to bigheadgm.com (don't delete it) |

Visits are counted with [GoatCounter](https://topherdarnell.goatcounter.com): no cookies and no personal data. Besides page views, it counts these events: started-draft, finished-draft, shared-draft, saved-draft-picture, and for the games blitz-daily-start, blitz-daily-done, blitz-free-start, blitz-free-done, blitz-shared, juke-start, juke-done and juke-shared.

To run the website on your computer:

```
cd docs
python3 -m http.server
```

Then open http://localhost:8000.

## The Python simulator

The site started as a terminal app, and the Python version still works. It's also where the data gets updated.

```
cd mockdraft
python3 mock_draft.py
```

1. Choose your team (or press Enter to watch the computer draft) and how many rounds (1–7).
2. At the start of each round, type a pick number to try trading up, or press Enter.
3. When you're on the clock, type a **rank number** to draft that player, a **position** (like `WR`) to filter the board, `more` to see more players, or `T` for trade-down offers.

| File | What it does |
|---|---|
| `mock_draft.py` | Runs the draft (run this one) |
| `auto_mocks.py` | Runs lots of computer-only drafts and prints a summary; `python3 auto_mocks.py 1000 --save` also saves `adp.csv` |
| `export_json.py` | Turns the CSV files into the JSON the website uses, adding each prospect's stats and age |
| `build_pages.py` | Builds the player, team, odds and games pages and the sitemap from the data (run it after `export_json.py`) |
| `convert_board.py` | Rebuilds `players.csv` from a new PFN big board export |
| `config.py` | Settings you can tweak, like how random the computer is |
| `models.py` | Player, Team and Pick |
| `data.py` | Loads the CSV files and saves results |
| `draft_logic.py` | Computer picks, value labels and grades |
| `trades.py` | Pick values and trades |
| `players.csv` | Prospects: rank, name, position, college, height, weight, class |
| `prospect_stats.csv` | 2025 college stats for the top 100: passing, rushing, receiving, tackles, sacks, interceptions (with the source of each line) |
| `sim_picks.csv`, `sim_positions.csv` | Also from the 1,000 drafts: the three most common players at every pick, and how many of each position go per round |
| `sim_first.csv`, `sim_teams.csv` | Also from the 1,000 drafts: everyone who went #1 and how often, and each team's ten most-drafted players |
| `market_odds.csv` | Sportsbook and prediction-market odds for the #1 pick, typed in by hand with the date and source. Update it when the odds move |
| `gm_info.csv` | Each GM's short name, catchphrase and team color, copied from `gm.js` for `build_pages.py` |
| `adp.csv` | From 1,000 simulated drafts: each player's average pick, earliest and latest pick, how often he's drafted and the team that takes him most |
| `prospect_ages.csv` | Birth date and age on draft day (April 29, 2027) for the top 100, with a link to the source of each date |
| `teams.csv` | Each team's needs, most important first |
| `draft_order.csv` | Every pick: round, pick number, team, original team |
| `trade_chart.csv` | Point value of every pick, modeled on the Jimmy Johnson chart |

### Updating the data

1. Update the CSV files in `mockdraft` (or run `convert_board.py` on a new big board export).
2. Run `python3 auto_mocks.py 1000 --save` to re-run the 1,000 drafts.
3. Run `python3 export_json.py` to rebuild the files in `docs/data`.
4. Run `python3 build_pages.py` to rebuild the player, team and odds pages.
5. Upload the new `docs` files to GitHub. The site updates in a minute or two.

## Data sources

- Big board: Pro Football Network consensus board
- Draft order: Tankathon
- Team needs: NFL.com
- College stats: cfbstats.com (official, full season), Stick to the Model and Ourlads
- Birth dates: each player's Wikipedia article

Data was last updated November 2026. Rankings and the draft order change every week, so mocks reflect the season so far.

Big Head GM is not affiliated with the NFL or any NFL team. Every GM is an original character, with team colors and no logos.
