# App Store listing: copy and paste

Everything App Store Connect asks for, in the order it asks. Character limits are in brackets.

## App Information

| Field | What to enter |
|---|---|
| Name [30] | `Big Head GM` |
| Subtitle [30] | `Fantasy Football + Mock Draft` |
| Bundle ID | `com.bigheadgm.app` |
| SKU | `bigheadgm-ios-1` |
| Primary language | English (U.S.) |
| Primary category | Sports |
| Secondary category | Entertainment |
| Content rights | "Does your app contain, show, or access third-party content?" → **Yes**, and tick that you have the rights. (Scores and stats are public facts; news and odds link to their sources.) |

## Pricing and Availability

- Price: **Free**
- Availability: United States to start (you can add countries later)

## Version 1.0 page

**Promotional text [170]** (you can change this any time without a new review)

```
Week 11 is here: start/sit calls, waiver pickups, live fantasy points and today's Fantasle. Free, no sign-up.
```

**Description [4000]**

```
Big Head GM is the free fantasy football app nobody in your league knows about yet.

DAILY GAMES
• Fantasle: guess the mystery fantasy football player in 8 tries. Green means a match, yellow means close.
• Prospectle: guess the mystery 2027 draft prospect.
• New puzzles every day, plus Unlimited mode. Turn on the daily reminder so you never lose your streak.

FANTASY TOOLS
• Start or sit: add the players you're stuck on and get a clear call, based on scoring, recent form and the matchup.
• Trade analyzer: see who wins the deal in PPR, half PPR, standard, TE premium, superflex, redraft or dynasty, and what it takes to even it out.
• Waiver wire: the best pickups each week at every position, and why.
• Rankings, rest-of-season schedules and a fantasy mock draft to practice for next year.

LIVE EVERY WEEK
• Scores and fantasy points for every player, every game.
• Quick-hit news: injuries, returns and new starters, each with its source.
• Award odds: MVP, Offensive and Defensive Player of the Year, the rookie awards and Coach of the Year.

2027 MOCK DRAFT
• Take over any team and run the draft. The computer picks for everyone else, and they'll call you with trade offers.
• A big board of the top 2027 prospects and team-by-team mock drafts.

No account. No ads. No sign-up.

Big Head GM is not affiliated with the NFL or any NFL team. Odds are shown for information only; Big Head GM is not a sportsbook and does not take bets.
```

**Keywords [100]** (commas, no spaces after them)

```
fantasy,football,mock draft,start sit,trade analyzer,waiver wire,ppr,dynasty,rookie,lineup,daily
```

| Field | What to enter |
|---|---|
| Support URL | `https://bigheadgm.com/support.html` |
| Marketing URL | `https://bigheadgm.com` |
| Privacy Policy URL | `https://bigheadgm.com/privacy.html` |
| Copyright | `2026 Big Head GM` |
| Version | `1.0` |

**Screenshots:** upload the 7 files in `screenshots/` to the **6.9" Display** slot, in order (1 home, 2 Fantasle, 3 trade, 4 start/sit, 5 mock draft, 6 scores, 7 award odds). They're 1320 × 2868, the size Apple asks for. The app is iPhone-only, so no iPad screenshots are needed.

## App Review Information

- Sign-in required: **No**
- Contact: your name, phone and `bigheadgm.support@gmail.com`
- **Notes** (paste this):

```
Big Head GM needs no account. Everything is free and works without signing in.

Native features to try:
• Games tab → "Daily reminder" switch schedules a local notification each morning for the new daily puzzles (Fantasle and Prospectle). Tapping it opens the game.
• Share any game result or mock draft: it uses the iOS share sheet.
• Buttons give light haptic feedback.
• With no connection, the app shows its own offline screen with a retry button.

Odds on the award odds and #1 pick odds pages are shown for information only, with their source. The app does not take bets, has no real-money features and does not link to place wagers.
```

## Age rating questionnaire

Answer **None / No** to everything, including Gambling and Simulated Gambling: the app shows sportsbook odds as news, but nobody can bet, spend or win anything in it. Let Apple's questionnaire pick the rating from there.

## App Privacy ("nutrition label")

Click **Get Started** and answer:

1. Do you or your third-party partners collect data from this app? **Yes**
2. Data types collected:
   - **Contact Info → Email Address**
     - Purpose: **Developer's Advertising or Marketing** (the weekly newsletter)
     - Linked to the user's identity: **Yes**
     - Used for tracking: **No**
   - **Usage Data → Product Interaction**
     - Purpose: **Analytics** (GoatCounter page counts)
     - Linked to the user's identity: **No**
     - Used for tracking: **No**
3. Nothing else. No location, contacts, identifiers, purchases or diagnostics.

## Export compliance

The setup script already answers it in the app (`ITSAppUsesNonExemptEncryption = NO`), so App Store Connect won't ask. The app only uses standard HTTPS.
