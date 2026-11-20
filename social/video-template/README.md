# Social video template (vertical 1080x1920, 140 BPM)

Last used for the Daniel Jones release post (Nov 20, 2026). Layout is centered: equal side margins
(cards 110px each side), hook at y≈640, cards pushed down to sit around the middle, app screens 720px wide.

- `head.html` styles, `body.js` the timeline (`setT(t)`), cards in `CARDS` (html cards or app screenshots with an optional crop/ring)
- `beat.py` makes the beat (HOOK/PER/N must match body.js), `shot.js` preview frames, `r.js` renders the mp4
- `x.html` + `xr.js` the 1600x900 X image
- Build the page: `(cat head.html; echo '<script>'; cat body.js; echo '</script></body></html>') > v.html`

Rules: no logos, no real player photos, no letterbox bars, no fake text-message bits. Captions for TikTok, Instagram,
YouTube Shorts and X with every video.
