# Social share image

`cover.png` (1200 × 630, ~430 kB) is the card shown when a link is posted to
X, Facebook, LinkedIn, Discord, Slack or iMessage. It is a real frame of the
simulation rather than a drawing: the star, a line of planets, and e's lit
limb, with the title set over a scrim.

## Regenerating

```bash
python tools/serve.py
```

then open <http://localhost:8124/?cover>. The page boots normally, then:
1. freezes time;
2. frames the shot (see `src/cover.js` for the camera placement, scale and
   title text);
3. renders it at exactly 1200 × 630;
4. uploads the PNG.

The dev server accepts that one upload — `PUT /og/cover.png`, from localhost,
PNG only — and nothing else. The frame depends on where the planets are at the
moment you load it, so regenerating gives a slightly different arrangement
each time.

## Before sharing

`index.html` references the card by absolute URL at
<https://trappist-1-sim.vercel.app/>, in four places (canonical, `og:url`,
`og:image`, `twitter:image`). Update all four if the domain changes. Check with
<https://www.opengraph.xyz> — platforms cache previews aggressively.
