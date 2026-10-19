# dev/ — local site harness without Docker

`task local-build && docker compose up` is still the way to validate this stack,
and nothing here replaces it. This harness exists for environments with **no
Docker daemon** — CI sandboxes, remote agent containers — where the site still
needs a real database and a real browser to be worked on.

It was built for the full-bleed map redesign, where the only way to judge a
change is to look at it.

## What it needs

- PostgreSQL 16 binaries (found at `/usr/lib/postgresql/16/bin` or Homebrew's
  `postgresql@16`; override with `PGBIN`).
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

### Sizing the fixture: `--flights N` and `reseed`

```bash
dev/db.sh up --flights 1000       # first run, 1,000 flights instead of 165
dev/db.sh reseed --flights 1000   # replace the seeded data; cluster and schema stay
dev/db.sh reseed                  # back to the default 165
node dev/seed.mjs --flights 1000 > seed.sql   # the SQL on its own
```

`reseed` deletes what the seed owns (flights, wings, pilots, description
preferences, sites from `ffvl_sid` 1000), inserts the new fixture, then runs the
wings backfill and the custom wing colour as `up` does. It is the fast way to
switch sizes: no `initdb`, no schema pass. `reset` takes `--flights N` too.

The same N always gives the same rows; different Ns share the pinned flights
(below) but are otherwise different fixtures.

## Scrolling at scale: perf.mjs

The flights list is not virtualised, so every flight is in the DOM; what keeps
it smooth is `content-visibility` on the month groups, memoised rows and months,
and hover selectors that return primitives. `perf.mjs` is the check that it
stays that way:

```bash
dev/db.sh reseed --flights 1000
node dev/perf.mjs                                # both passes, desktop
node dev/perf.mjs --viewport mobile
node dev/perf.mjs --base http://localhost:3001   # e.g. a production build
node dev/perf.mjs --pass expanded --budget 100 --throttle 4
dev/db.sh reseed                                 # back to 165 when done
```

It throttles the CPU 4× through CDP, loads `/flights`, waits for the map to
settle, then steps the panel's scroller from top to bottom while recording
`longtask` entries. Two passes, each on a fresh page: **default** (the newest
month open, older months showing their standouts) and **expanded** (every
"Show all" opened first, so all 1,000 rows are in the panel). Any scroll task
over the budget (100 ms) or any console error fails it; the exit code is
non-zero.

Only the scroll is gated. Load, the map settling and opening months are
printed but not judged: hydrating a thousand rows under a 4× throttle is a
long task by nature, and opening a month is work the reader asked for.

What it cannot separate from the list is **the map**. In this headless
Chromium WebGL is software (SwiftShader), so the map's drawing is on the main
thread: the first draw of 1,000 tracks is several seconds of long tasks (up to
~1.8 s each), and every hover redraw costs ~350 ms (~160 ms at 165 flights). That
is why it waits for the map before scrolling, and parks the pointer on the top
bar: rows passing under a pointer hover their flights. `--pointer over` leaves
it on the panel to measure that map cost instead; it fails, and that is the
map, not the list.

Against a production build (`dev/site.sh build`, then `yarn next start` with
the same environment) the map proxy is off by design, so build with
`PLOUFBAG_DEV_MAP_PROXY=0` for the browser to reach Mapbox directly. There is
no `window.__ploufbagMap` in production, so the wait is for the main thread to
go quiet (3 s without a long task) instead.

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
flights (`--flights N` for any other size).

The flights are shaped like a season, for the month-grouped flights list:

- **Seasonal.** November 2024 to October 2026, shared across months by weight:
  busy June–August, one or two flights a month December–February. The newest
  month with flights is **October 2026** (up to the 17th), as in the approved
  designs.
- **Pinned edge cases**, present at every N (all ten from N = 10):
  - 23:35 on 31 July and 00:25 on 1 August, 23:50 on 30 September and 00:10 on
    1 October, 23:40 on 31 December 2025 and 00:20 on 1 January 2026 — Paris
    time, so each second flight is in the *previous* month in UTC.
  - 00:30 on 29 March 2026 for 2 h, and 00:40 on 26 October 2025 for 2 h 20:
    in the air when the clocks change.
  - Exactly `9000` s and `8999` s, either side of the 2h30 standout rule, in
    October 2026.
- **About 7% standouts** (`duration_sec >= 9000`) — exactly `round(0.07 × N)`,
  chosen from April–September flights, with longer tracks to match.

After the wings backfill, `db.sh` gives the first wing by pilot and name
(Théo's *Gin Bonanza 3* at the default size and at 1,000) the colour `#0d9488`, which is outside the hash
palette. Every other wing keeps the colour the map derives from its name, so
anything that ignores `wing_colour` shows up on that wing's flights.

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

## One screenshot: capture.mjs

The tour is fixed. For visual QA every check names its own page, state,
breakpoint and theme, and the build screenshot has to be taken under exactly
those conditions:

```bash
node dev/capture.mjs --path /flights --viewport mobile --out vqa-07.png
node dev/capture.mjs --path /dashboard --pilot 4210001 --out dashboard.png   # signed in
node dev/capture.mjs --path /sites --theme dark --full-page true --out sites.png
node dev/capture.mjs --path /flights --wait-for "main" --out flights.png
```

`--pilot` signs in as any seeded pilot (same minted session as the tour);
without it you get the logged-out view. It exits non-zero if the page throws,
so a screenshot of a crashed page is never passed off as evidence.

It waits for Mapbox to report the map idle, as the tour does, rather than for a
fixed delay, which on a slow machine caught "Loading map…". Routes whose camera
never stops (home, login, welcome) are detected from the page and captured once
their tiles are in. `--map none` skips the wait; `--settle <ms>` adds time after
it.

Console errors that belong to the environment rather than the site -- blocked
Mapbox telemetry, Google Fonts, aborted tile fetches -- are ignored by both
scripts; the list is `IGNORED_CONSOLE_ERRORS` in `browser.mjs`.

Both scripts share their browser plumbing in `browser.mjs`. Playwright is found
via `PLAYWRIGHT_MODULE`, the agent-container path, or `npm root -g`, so a global
`npm install -g playwright` (plus `npx playwright install chromium`) is enough
on a Mac.
