# Weekly update (every Tuesday)

The owner (Topher) has approved this whole routine: update the site, push it to GitHub, and
put the weekly email in Kit as a **draft**. Don't wait for approval for these steps. Never
send or schedule the email: that click is his.

Work in a clone of `topher-darnell/mock-draft` (branch `main`). Run every script from the
`mockdraft` folder.

## 1. Standings and draft order

1. Find the current 2027 draft order with strength of schedule, after Monday night's game
   (profootballmania.com/nfl-draft/order/ has records and SOS). Check its records against
   the NFL standings for this week.
2. Use the same convention the site uses: non-playoff teams first by record (ties: lower SOS
   picks first), then the teams currently in playoff position (division leaders and wild
   cards), as that page lists them.
3. Write `standings.txt`: one line per group of teams with the same record, in order, using
   the abbreviations in `update_order.py` (LAR for the Rams, JAX for the Jaguars, WAS for the
   Commanders). Example: `IND PHI NYJ`.

## 2. Trades

Search the news for any NFL trade since the last update that moved a 2027 draft pick
(check team sites, NFL.com, ESPN). Confirm each with two sources. For each one, edit that
pick's row in `draft_order.csv` (set `team` to the new owner and `from` to the original team).
List what you changed in the commit message.

## 2b. Fantasy stats

1. With WebFetch, open the four FFToday season pages (PosID 10 = QB, 20 = RB, 30 = WR, 40 = TE):
   `https://www.fftoday.com/stats/playerstats.php?Season=2026&GameWeek=&PosID=10&LeagueID=`
   Ask for the table "verbatim, each row on its own line, cells separated by |" (asking for CSV
   scrambles rows).
   Each page shows 50 players; add `&LeagueID=0&order_by=FFPts&sort_order=DESC&cur_page=1` (then 2)
   for the next pages. Get every page needed for about 50 QBs, 100 RBs, 150 WRs and 85 TEs.
2. Rewrite `fantasy_stats.csv` (keep the columns; `fftoday_half` = FFToday's FPts). Keep all of
   those players: Fantasle and the Fantasy page's search use the whole list. Use JAX for Jacksonville and WAS for Washington, and give
   traded players their new team.
3. Change `STATS_AS_OF` in `fantasy.py` to the new week: the last week whose Monday game is done
   (on Tuesday Nov 17 that's Week 10). `fetch_weekly.py` prints the last week played; they must agree.
   Then refresh the game-by-game stats and schedule: `python3 fetch_weekly.py` (downloads from
   nflverse on GitHub; used by Trending and the rest-of-season rankings; nflverse can lag a day).
   Also save a backup copy of the season totals: `cp fantasy_stats.csv fantasy_history/2026-wNN.csv`, where NN is
   the last week the stats count (two digits, e.g. `2026-w11.csv`). Never edit or delete old copies:
   they're a week-by-week record of the season totals.
4. Run `python3 fantasy.py`: it must say "0 to check".
5. **Injuries** (`fantasy_injuries.csv`): `fetch_weekly.py` already saves the official roster
   (injured reserve) and injury report in `fantasy_status.csv`. On top of that, search the news for
   this week's fantasy injury report (e.g. Yahoo's "NFL Injury Report, Week N" and team news) and
   update `fantasy_injuries.csv`: status `out`, `ir`, `season`, `doubtful` or `questionable`,
   `back_week` = the first week he's expected to play (leave blank if no date; IR with no date counts
   as 4 weeks out), the injury, the source and the date. Remove players who are playing again.
   Check every injured player who's in the top 60 of the rest-of-season rankings with two sources.
   Never guess a return week.
6. **Teams:** every player's current team comes from the official roster in `fantasy_status.csv`
   (refreshed by `fetch_weekly.py`). For moves newer than that feed (trades or signings in the last few
   days), add a row to `fantasy_teams.csv` (name, team, date, source), confirmed with two sources.
   Delete rows once the roster feed shows the new team.
7. Ages for Fantasle live in `nfl_ages.csv`. Add any new player (ESPN team roster pages list ages:
   espn.com/nfl/team/roster/_/name/buf). About once a month, refresh everyone's age so birthdays count. The TE table has no rushing columns, so a
   TE that is off by a few points ran the ball: put the missing rushing yards/TDs on his row.

## 3. Rebuild

    python3 update_order.py standings.txt
    python3 auto_mocks.py 1000 --save
    python3 export_json.py
    python3 build_pages.py
    python3 weekly_summary.py

If the #1 pick odds have moved (search "2027 NFL Draft #1 pick odds" for FanDuel and Kalshi),
update `market_odds.csv` with the new numbers, source and date, and run `build_pages.py`
again. Never guess odds: if you can't find a dated source, leave the file as it is.

Check before pushing: `docs/data/draft_order.json` has 257 picks, round 1 has 32, and
`sims.json` slot 1 belongs to the team with the worst record.

## 4. Push

Commit everything (including `history/`) to `main` with a message that lists the new top 5
picks and any trades, and push. GitHub Pages updates bigheadgm.com in a minute or two.

## 5. The weekly email (Kit)

Create a draft broadcast with the Kit connector (`create_broadcast`, template id `5683115`,
"Text only"), using `content_tree` blocks like the first one (broadcast 26935295, Nov 10):

- **Subject:** the biggest story of the week in a few words (a trade, a new #1, a riser).
- **Preview text:** "Your weekly 2027 mock: the new top 10 from 1,000 simulated drafts."
- The week's big news (trades, big moves in the order), 2–3 sentences.
- **The top 10:** a numbered list, "Team: Player, POS, School (xx%)". It's the most likely
  pick at each slot, so say so; if a player leads two slots, add "if he's still there".
- **Risers** and **Fallers**: 3 each from `weekly_summary.py`, each linked to
  `https://bigheadgm.com/players/<slug>.html` (slug: lowercase, apostrophes and dots removed,
  everything else non-alphanumeric becomes "-").
- **Fantasy: heating up / cooling off**: run
  `python3 -c "import fantasy, json; print(json.dumps(fantasy.trends()))"` and pick 3 players
  heating up and 2 cooling off in PPR (biggest change in points per game, at least 8 PPG lately for
  risers). One line each with the numbers ("18.4 PPG the last 3 weeks, was 9.1; 23 carries a game"), linked to
  `https://bigheadgm.com/fantasy/<slug>.html`, then a link to https://bigheadgm.com/fantasy.html#trending
  and one to the trade analyzer https://bigheadgm.com/fantasy-trade.html
- **Who goes #1?**: our sims plus the market odds with their dates, linked to
  https://bigheadgm.com/odds.html
- An orange button (`#F2A93B`, text `#1B1206`): "Run your own mock draft" →
  https://bigheadgm.com/?start=1
- A line about Draft Day Blitz → https://bigheadgm.com/games/blitz.html
- "Hit reply and tell me your team. I read every one." and "— Big Head GM"
- If odds are mentioned, end with, in italics: "Odds as of <dates>, for information only.
  Big Head GM doesn't take bets. 21+, 1-800-GAMBLER."

Description: "Weekly mock (after Week N, <date>)". Leave it as a draft.

## 6. Report

Finish with a short message for Topher: the new top 5, any trades, anything you couldn't
verify, and the Kit link (`confirm_url`) so he can review and send.

## Franchise QBs

`FRANCHISE_QB` in `config.py` (and the same list in `docs/app.js`) lists teams with an established
starting QB; they don't draft a QB in rounds 1-3. If a team benches, cuts or trades its starter, or
signs/trades for one, update both lists before running the simulations.

## Rules that always apply

- No NFL or team logos, no real player photos, never identify people from faces.
- Keep the site orange (#F2A93B).
- Write in plain English.
