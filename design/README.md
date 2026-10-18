# design/ — UI designs, made before the code

UI work in the agent-driven process (see the Notion page *Agent-Driven
Development — the Ploufbag process*) is designed here **before** any
implementation plan exists. The approved design is the contract the build and
visual QA are checked against, so it lives in the repo and is approved by
merging a PR.

Designs are [pen.dev](https://www.pen.dev) `.pen` files: structured JSON, so
they diff, review and version like code.

## Layout

```
design/
  library.lib.pen                 # Ploufbag UI library: tokens + components
  PLOUF-12-flight-filters/        # one folder per Linear project
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

## The library

`library.lib.pen` holds the colours, type, spacing and core components the site
already uses — sourced from `site/src/styles/globals.css`, the `/styleguide`
page and real pages captured with `dev/capture.mjs`. Every project file imports
it rather than redrawing buttons, so designs stay on-brand and buildable. If a
design needs something new, it is made as a component in the project file and
called out under *Decisions* in the review pack; promote it to the library when
it ships.

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

1. The design agent opens a **design PR** (targeting `main`) with `designs.pen`
   and `exports/`, and writes the review pack — every PNG, a coverage table,
   decisions — into the Linear issue *[Human] Approve UI designs*.
2. Feedback goes back as comments on the design issue; the agent pushes changes
   to the same PR.
3. **Merging the design PR is the approval.** The merged files on `main` are
   what visual acceptance criteria (VQA-n) and the build are measured against.
   Later changes to an approved design go through a new PR, never a silent edit.

To look closely, open `designs.pen` in the free pen.dev desktop app.
