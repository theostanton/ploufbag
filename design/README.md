# design/ — UI designs, made before the code

UI work in the agent-driven process (see the Notion page *Agent-Driven
Development — the Ploufbag process*) is researched and designed here **before**
any implementation plan exists. The approved design is the contract the build and
visual QA are checked against, so it lives in the repo and is approved by
merging a PR.

Designs are [pen.dev](https://www.pen.dev) `.pen` files: structured JSON, so
they diff, review and version like code.

## Layout

```
design/
  library.lib.pen                 # Ploufbag UI library: tokens + components
  library-assets/                 # images the library uses (map backdrops, 🪂 mark)
  library-exports/                # overview + reference pages, PNG at scale 2
  research/patterns.md            # cross-project index of research findings
  PLOUF-12-flight-filters/        # one folder per Linear project
    research/
      deck.md                     # Marp slide deck: the research and decisions
      current/                    # captures of Ploufbag as it is today
      refs/                       # captures of other products -- gitignored
    designs.pen                   # every frame for the project
    exports/
      Flights--Empty--Mobile--Light.png
      Flights--Empty--Desktop--Light.png
      ...
```

- **Folder:** `<first issue id of the Linear project>-<kebab-case slug>`.
- **Frames:** one per ✅ cell of the project's Design Brief matrix, named
  `View / State / Breakpoint / Theme` — e.g. `Flights / Empty / Mobile / Light`.
- **Exports:** one PNG per frame at scale 2, named with `--` in place of
  ` / ` (pen.dev names exports by node id, so rename them). Breakpoints are
  `Mobile` (390 px wide) and `Desktop` (1440 px), the same two viewports
  `dev/capture.mjs` uses, so a design and its build screenshot line up.

## Research, before the brief

A UI project's *Designed* milestone starts with research, approved by a human
before the Design Brief is written. The agent looks at how other products solve
the same problems, shows its working, and asks for the decisions that set the
direction. The output is one [Marp](https://marp.app) deck,
`research/deck.md`: plain Markdown that renders as slides for review and stays
readable as text, so later issues in the project can cite it.

**Depth** is set in the Spec, with an agent recommendation that can be
overridden:

| Depth | When | What |
|---|---|---|
| Full | a new feature, view or flow | 8–15 references, at least a third from outside the space |
| Light | a change to an existing view | 3–5 references, usually one or two decisions |
| Skip | stays within existing patterns | no deck; the brief says why |

**Two kinds of reference**, labelled as such in the deck:

- **Same space** — products doing something similar: other flight logs and
  paragliding tools, Strava and other activity trackers.
- **Borrowed paradigm** — a product from any other domain whose interaction
  pattern fits ours (a photo timeline, a flight-radar map, a finance
  dashboard). Each must say what the paradigm is and how it would translate to
  Ploufbag — the translation is the point, not the product.

**Every reference states its evidence**, because a confident description of a
screen nobody looked at is worse than none:

- `seen` — the agent opened it and captured what it describes;
- `marketing` — from the product's own site, store listing or docs images;
- `inferred` — reasoned from indirect sources; say which.

Each carries its source URL and the date accessed. Native apps the agent cannot
run are `marketing` at best.

**Every reference is scored on the same rubric**, holistically and in detail:
the core task and how many steps it takes; information density and
hierarchy; navigation and wayfinding; map and track interaction; mobile
ergonomics; empty, loading and error states; onboarding and first use;
accessibility (contrast, target size, motion). Each gets *Do* and *Avoid*
notes.

**Deck order** — the review should take ten minutes, with detail after:

1. Summary: what was studied, the recommended direction, the decisions needed.
2. Decisions **D-1 … D-n**: the question, two or three options with
   trade-offs and a reference image each, and the agent's recommendation.
3. The problem and the user tasks, from the Spec.
4. Ploufbag today — `research/current/`, captured with `dev/capture.mjs`,
   judged on the same rubric, plus what `library.lib.pen` already offers.
5. References, one or two slides each.
6. Patterns: what works across the references.
7. **Avoid** — poor solutions seen elsewhere, and why.
8. **Explored and rejected** — directions the agent considered for Ploufbag
   and decided against, with reasons, so they are not re-proposed later.
9. Suggested spec changes, if the research shows the spec aims wrong.
10. Sources: every URL with its access date and evidence level.

**Decisions are answered in Linear, not in the deck.** Each D-n is a
`[Human] D-n: …` sub-issue in the Checks team; the answers are recorded in the
project's *Design Decisions* document, which the Design Brief, the designs and
the VQA criteria cite by ID.

**Screenshots of other products are not committed** — this repo is public.
They go in `research/refs/` (gitignored), the deck links them by relative path,
and the rendered PDF, which embeds them, is attached to the Linear research
issue. That PDF is the durable copy; the committed `deck.md` keeps the text,
sources and descriptions. Captures of Ploufbag itself go in `research/current/`
and are committed.

Render it with any Chromium (Playwright's works):

```bash
cd design/PLOUF-12-flight-filters/research
CHROME_PATH="$(node -e "import('../../../dev/browser.mjs').then(b => console.log(b.loadChromium().executablePath()))")" \
  npx --yes @marp-team/marp-cli@4.1.2 deck.md --pdf --allow-local-files -o deck.pdf
```

When the project ships, add its durable findings to `research/patterns.md`, so
the next project touching the same area starts from them rather than from
scratch.

## The library

`library.lib.pen` holds the colours, type, spacing and core components the site
already uses — sourced from `site/src/styles/globals.css`, the `/styleguide`
page and real pages captured with `dev/capture.mjs`. Every project file imports
it rather than redrawing buttons, so designs stay on-brand and buildable. If a
design needs something new, it is made as a component in the project file and
called out under *Decisions* in the review pack; promote it to the library when
it ships.

What is in it:

- **Variables** named after the CSS custom properties without the `--`
  (`--color-primary` → `$color-primary`, `--space-4` → `$space-4`, in px).
  Also tokens for values the site repeats outside `globals.css`: the track and
  site palettes (`$track-*`, `$site-*`), translucent state colours
  (`$color-secondary-a14` for a selected row) and the chrome radii.
  Shadows are split into `-y`, `-blur` and `-color`, because pen effects take
  numbers rather than a CSS shadow string. Transitions and
  `--sheet-height-mobile` (a `dvh` calc) have no variable.
- **Components**: top bar (desktop and mobile), buttons, search field,
  checkboxes, chips and tags, list items (flight, site, pilot, wing), panels
  (`Panel / Sheet`, `Panel / Sheet Mobile`, `Panel / Glass`, each with a
  `Content` slot), cards, signup card, stat tiles, empty, error and loading
  states, and `Map Backdrop` (a still of the satellite map, used for context only).
- **Library overview** and one **Reference** frame per page and breakpoint,
  rebuilt only from the components. If a reference stops matching
  `dev/capture.mjs`, either the site or the library has drifted.

Quirks of pen.dev worth knowing before editing it:

- `width` and `height` ignore `$variables`; use the pixel value (padding, gap,
  radius and colours do take variables).
- A layer name containing `/` cannot be a `descendants` key: it is read as an
  instance path. Name the parts of a component without slashes.
- A frame with no children collapses to zero, padding or not. Use a parent's
  `gap` for spacing rather than empty spacer frames.
- Emoji render as monochrome glyphs, so the 🪂 mark is `library-assets/para.png`.

## Working with pen.dev headlessly

The CLI (`npm i -g @pen.dev/cli`, authenticated with `PEN_CLI_KEY`) has an
editor with no GUI that takes commands on stdin:

```bash
pen interactive -i design/PLOUF-12-flight-filters/designs.pen \
                -o design/PLOUF-12-flight-filters/designs.pen < commands.txt
```

`commands.txt` starts with `read_skill()` (pen.dev's own instructions) and
`import_library({ path: "design/library.lib.pen" })`, makes changes with
`execute({ input: '...' })`, exports with `Export([...], "png", "<dir>")`
inside an `execute`, and ends with `save()` then `exit()`. Check the `.pen`
file was actually written — an export failure can exit 0.

The free plan allows five agent days a month, so batch design work into as few
sessions as possible.

## Review and approval

1. The research deck is approved first (see above). The design agent then
   opens a **design PR** (targeting `main`) with `designs.pen`
   and `exports/`, and writes the review pack — every PNG, a coverage table,
   decisions — into the Linear issue *[Human] Approve UI designs*.
2. Feedback goes back as comments on the design issue; the agent pushes changes
   to the same PR.
3. **Merging the design PR is the approval.** The merged files on `main` are
   what visual acceptance criteria (VQA-n) and the build are measured against.
   Later changes to an approved design go through a new PR, never a silent edit.

To look closely, open `designs.pen` in the free pen.dev desktop app.
