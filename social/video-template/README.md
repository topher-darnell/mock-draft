# Social video template (vertical 1080x1920, timed to "Sweet As Honey")

Last used for the Daniel Jones release post (Nov 20, 2026). Layout is centered: equal side margins
(cards 110px each side), hook at y≈640, cards pushed down to sit around the middle, app screens 720px wide.

- `head.html` styles, `body.js` the timeline (`setT(t)`), cards in `CARDS` (html cards or app screenshots with an optional crop/ring)
- `beat.py` makes the beat (HOOK/PER/N must match body.js), `shot.js` preview frames, `r.js` renders the mp4
- `x.html` + `xr.js` the 1600x900 X image
- Build the page: `(cat head.html; echo '<script>'; cat body.js; echo '</script></body></html>') > v.html`

Rules: no logos, no real player photos, no letterbox bars, no fake text-message bits. Captions for TikTok, Instagram,
YouTube Shorts and X with every video.

## The sound: "Sweet As Honey" (The Sundries, TikTok original sound by Kaylea B.)

Topher's sound for every video (Nov 20, 2026). Measured from his screen recording:
- 122.4 BPM (beat 0.490s). With video t=0 at the start of the sound, the first beat is at **0.25s**.
- A big hit every bar (1.961s) at **1.23s, 3.19s, 5.15s, 7.11s, 9.07s, 11.03s, 12.99s, 14.95s, 16.91s, 18.87s**.
- The TikTok clip is about 21s, so keep videos under 20s.

In `body.js`: `BEAT = 60 / 122.4`, `OFF = 0.25 / BEAT`, `HOOK = OFF + 6`, `PER = 4` → hook words pop on beats
0.25/0.74/1.23/1.72 and each card changes on a bar hit (3.19, 5.15, ...).

Don't put the song itself in the file (copyright: YouTube/Instagram can mute or flag it). `beat.py` makes a
matching 122.4 BPM beat for YouTube and X. On TikTok and Instagram, Topher taps "Use sound" / adds
"Sweet As Honey" and turns the original audio to 0. Because the video starts at the sound's start, the cuts land on the hits.
