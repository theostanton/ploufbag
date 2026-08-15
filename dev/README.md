# dev/ — local site harness without Docker

`task local-build && docker compose up` is still the way to validate this stack,
and nothing here replaces it. This harness exists for environments with **no
Docker daemon** — CI sandboxes, remote agent containers — where the site still
needs a real database and a real browser to be worked on.

It was built for the full-bleed map redesign, where the only way to judge a
change is to look at it.

## What it needs

- PostgreSQL 16 binaries (`/usr/lib/postgresql/16/bin`, override with `PGBIN`).
  The schema needs the `earthdistance`, `cube` and `uuid-ossp` extensions —
  **not** PostGIS, despite what `CLAUDE.md` says. `sites.polygon` is a plain
  `json` column.
- Node 20+.
- Playwright with a Chromium build, for screenshots only.

## Usage

```bash
dev/db.sh up          # initdb, start on :5433, apply schema, seed fixtures
dev/site.sh           # next dev on :3000, pointed at that database
node dev/shots.mjs    # drive the tour, write dev/shots/*.png
```

Then `dev/db.sh down` when finished, or `dev/db.sh reset` to start clean.

The Postgres data directory lives in `$TMPDIR/ploufbag-dev` by default, outside
the repo, so it cannot be swept into a commit. Override with
`PLOUFBAG_DEV_ROOT`.

## Mapbox token

Copy `dev/env.example` to `dev/.env.local` and set `NEXT_PUBLIC_MAPBOX_TOKEN`.
Without it the chrome renders fine but the map stays on "Loading map…", which
makes the screenshots useless for anything map-related.

A public `pk.*` token is the right kind — it already ships to the browser in the
built site — but scope it to localhost in the Mapbox dashboard.

## Fixtures

`dev/seed.mjs` generates SQL on stdout: 6 pilots, 32 sites across 6 real flying
regions (Annecy, Chamonix, Saint-Hilaire, Verbier, Gourdon, Dolomites), and 165
flights.

Generated rather than dumped, because the map needs *density* to be judged
honestly — colour-by-pilot, dimming, label collision and camera framing all look
fine with three flights and fall apart with two hundred. The generator is seeded,
so the same fixtures come out every run and screenshots stay comparable.

Tracks are synthesised: drifting thermal circles joined by glides, ending on a
final glide into the landing field. They are shaped like paraglider flights
because that is what makes a track legible on a map. They are not real GPS and
the statistics are not physically exact.

The five fixture sites seeded by `create_sites.sql` are deliberately left in
place — they are sites with no flights, which is what the `/sites` "only with
flights" filter needs in order to have something to filter.

## What the screenshots cannot show

`backdrop-filter` does not work in this headless Chromium — it computes to
`none` regardless of the GL backend — so the chrome panels appear without their
blur. What you see is the `@supports not (backdrop-filter: ...)` fallback in
`globals.css`, which raises the panel opacity to near-solid.

That is a real appearance for real users (older Firefox, GPU-less machines,
browsers that disable the effect for performance), so it is worth reviewing.
But it is not what the design looks like on a normal desktop or phone, where
the panels are translucent and the map blurs behind them. Judge blur-dependent
decisions on a real browser, not on these PNGs.

## The tour

`dev/shots.mjs` is a camera and a regression check. Beyond the screenshots it
asserts the things that are invisible in a still frame:

- Navigating from the map to a flight detail **does not rebuild the Mapbox
  instance** — checked by tagging the live canvas and comparing identity across
  the navigation. This is the entire premise of the redesign.
- Browser back likewise keeps the same instance.
- A cold load of a flight detail reaches the same view as arriving by click.
- Any `pageerror` or `console.error` fails the run.

A step whose precondition did not happen (no track on the map to click, for
instance) reports as skipped and cascades that skip to steps that depend on it,
rather than failing them for a reason that is not a regression.

```bash
node dev/shots.mjs --only flights        # steps matching a substring
node dev/shots.mjs --viewport mobile     # one viewport (desktop | mobile)
node dev/shots.mjs --base http://localhost:3001
```

Exits non-zero on any failure, so it can gate a commit.
