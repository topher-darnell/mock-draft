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
2. Rewrite `fantasy_stats.csv` (keep the columns; `fftoday_half` = FFToday's FPts). Keep the top
   40 QBs and RBs, 50 WRs and 30 TEs. Use JAX for Jacksonville and WAS for Washington, and give
   traded players their new team.
3. Change `STATS_AS_OF` in `fantasy.py` to the new week.
4. Run `python3 fantasy.py`: it must say "0 to check". The TE table has no rushing columns, so a
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

## Rules that always apply

- No NFL or team logos, no real player photos, never identify people from faces.
- Keep the site orange (#F2A93B).
- Write in plain English.
