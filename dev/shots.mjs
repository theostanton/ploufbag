#!/usr/bin/env node
//
// Drives the local site through a fixed tour and writes screenshots.
//
// This is the feedback loop for the full-bleed map work in an environment with
// no display and no Docker: the tour is the closest thing to somebody clicking
// around, and the PNGs are what actually get reviewed.
//
// It is also a regression check, not only a camera. The tour asserts the things
// that are easy to break and invisible in a still frame -- above all that
// navigating between views does not rebuild the Mapbox instance, which is the
// entire premise of the redesign.
//
//   node dev/shots.mjs                      # whole tour, both viewports
//   node dev/shots.mjs --only flights       # steps whose name contains "flights"
//   node dev/shots.mjs --viewport mobile    # one viewport
//   node dev/shots.mjs --base http://localhost:3000 --out dev/shots
//
// Exits non-zero if any assertion fails or any page throws, so it can gate a
// commit.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Playwright is installed globally in this environment rather than as a project
// dependency -- the site's package.json should not grow a browser automation
// dependency for a dev-only harness.
const require = createRequire(import.meta.url);
const requirePaths = [
    '/opt/node22/lib/node_modules/playwright',
    'playwright',
];
let chromium;
for (const candidate of requirePaths) {
    try {
        ({ chromium } = require(candidate));
        break;
    } catch {
        // try the next candidate
    }
}
if (!chromium) {
    console.error('playwright not found. Install it, or set NODE_PATH to the global node_modules.');
    process.exit(1);
}

// ------------------------------------------------------------------- options

function parseArgs(argv) {
    const options = {
        base: 'http://localhost:3000',
        out: 'dev/shots',
        only: null,
        viewport: null,
        timeout: 45000,
    };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        const value = argv[i + 1];
        if (!(key in options)) {
            console.error(`unknown option --${key}`);
            process.exit(1);
        }
        options[key] = key === 'timeout' ? Number(value) : value;
    }
    return options;
}

const options = parseArgs(process.argv.slice(2));

const VIEWPORTS = {
    desktop: { width: 1440, height: 900, isMobile: false },
    mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
};

// ---------------------------------------------------------------------- tour

// Each step is a screenshot plus, optionally, an interaction that got us there
// and assertions about where we ended up. `act` receives the Playwright page and
// a helpers object.
const TOUR = [
    {
        name: '01-home',
        path: '/',
        // The camera drifts here by design, so this frame is caught mid-rotation
        // and the bearing differs between runs.
        ambient: true,
    },
    {
        name: '02-flights',
        path: '/flights',
    },
    {
        name: '02b-nav-keeps-map',
        path: '/flights',
        // The weaker of the two persistence checks, but it needs no map data, so
        // it catches a regression (a raw <a href> creeping back into the nav, a
        // second layout appearing) long before the click tour can run.
        act: async (page, { expect, mapCanvasId, waitForPath }) => {
            const before = await mapCanvasId();
            if (before === null) return { skipped: 'no map instance (Mapbox token missing?)' };
            await page.getByRole('link', { name: 'Sites', exact: true }).click();
            await waitForPath(/^\/sites\/?$/);
            const after = await mapCanvasId();
            expect(before === after, 'top-bar navigation rebuilt the map instance');
            return {};
        },
    },
    {
        name: '03-flight-detail-via-map-click',
        path: '/flights',
        // The premise of the redesign: clicking a track on the map navigates,
        // and the map itself is never rebuilt.
        act: async (page, { clickFirstTrack, expect, mapCanvasId, waitForPath, peekSheet }) => {
            const before = await mapCanvasId();
            let clicked = await clickFirstTrack();
            if (!clicked) {
                // On a phone the half-height sheet leaves too little map to hit
                // a thin track, which is exactly what the peek snap is for.
                // Collapsing and retrying is the real user flow, so test it
                // rather than skipping.
                if (await peekSheet()) clicked = await clickFirstTrack();
            }
            if (!clicked) return { skipped: 'no track-only point visible even at the peek snap' };
            await waitForPath(/^\/flights\/\d+/);
            const after = await mapCanvasId();
            expect(
                before !== null && before === after,
                `map instance was rebuilt across navigation (before=${before} after=${after})`
            );
            return {};
        },
    },
    {
        name: '04-back-to-flights',
        path: null, // continues from the previous step
        // Nothing to go back from if the click step never navigated.
        requires: '03-flight-detail-via-map-click',
        act: async (page, { expect, mapCanvasId, waitForPath }) => {
            const before = await mapCanvasId();
            await page.goBack({ waitUntil: 'commit' });
            await waitForPath(/^\/flights\/?$/);
            const after = await mapCanvasId();
            expect(
                before !== null && before === after,
                'map instance was rebuilt on browser back'
            );
            return {};
        },
    },
    {
        name: '05-flight-detail-cold-load',
        // Deep-link parity: arriving cold must produce the same view as
        // arriving by click.
        path: async (page, { firstFlightHref }) => (await firstFlightHref()) ?? '/flights',
    },
    {
        name: '06-sites',
        path: '/sites',
    },
    {
        name: '07-site-detail',
        path: '/sites/col-de-la-forclaz',
    },
    {
        // A landing field, which is where site polygons actually exist -- the
        // FFVL data (and the fixtures) carry outlines for landings, not
        // takeoffs, so the takeoff above never exercises that layer.
        name: '07b-landing-site-polygon',
        path: '/sites/doussard',
    },
    {
        name: '08-pilots',
        path: '/pilots',
    },
    {
        name: '09-pilot-detail',
        path: '/pilots/4210001',
    },
    {
        // The peek snap is the reason snapping exists: at the half height the
        // sheet leaves too little map to hit a track on a phone. Cycling the
        // handle to peek should give the map back, and the camera should
        // re-frame into the space that opens up.
        name: '09b-sheet-peek',
        path: '/flights',
        act: async (page, { expect }) => {
            const handle = page.getByRole('button', { name: /Resize panel/ });
            if (!(await handle.isVisible().catch(() => false))) {
                return { skipped: 'no drag handle (desktop rail)' };
            }
            const before = (await page.locator('section[data-mode]').boundingBox())?.height ?? 0;
            // peek is one step past half in the cycle order.
            await handle.click();
            await handle.click();
            await page.waitForTimeout(600);
            const after = (await page.locator('section[data-mode]').boundingBox())?.height ?? 0;
            expect(after < before, `peek did not shrink the sheet (${before} -> ${after})`);
            return {};
        },
    },
    {
        name: '10-login',
        path: '/login',
        ambient: true,
    },
];

// ------------------------------------------------------------------- helpers

// The Next dev-tools badge floats over the bottom-left corner, which is exactly
// where the map controls and the mobile sheet handle live. Hide it so it is not
// in every frame of every review.
async function hideDevOverlay(page) {
    await page.addStyleTag({
        content: `
            nextjs-portal,
            [data-nextjs-toast],
            #__next-build-watcher,
            [data-next-badge-root] { display: none !important; }
        `,
    }).catch(() => {
        // A page that failed to load has no document to style; not worth failing over.
    });
}

/**
 * Console noise that is a property of this sandbox rather than of the site.
 *
 * Two kinds:
 *  - Requests the container's egress policy blocks outright. The browser here
 *    has no direct outbound HTTPS at all (Mapbox goes through the dev proxy),
 *    so the Google Fonts stylesheet in globals.css always fails.
 *  - Tile fetches aborted mid-flight. The tour navigates as fast as it can and
 *    every camera move cancels the tiles for the view it left; mapbox-gl
 *    reports those as failed fetches. They are normal operation, not a defect.
 *
 * Everything else still fails the run.
 */
const IGNORED_CONSOLE_ERRORS = [
    /fonts\.googleapis\.com/,
    /ERR_CONNECTION_RESET/,
    /Failed to fetch[\s\S]*\/api\/dev\/mapbox/,
    // An aborted tile request, identified by the stack pointing into
    // mapbox-gl. Matched on the stack rather than on the message alone so a
    // "Failed to fetch" from our own code still fails the run.
    /Failed to fetch[\s\S]*mapbox-gl/,
    /AbortError/,
]

/** Snap points in Sheet.tsx; the handle cycles through them in order. */
const SNAP_CYCLE_LENGTH = 3;

const isIgnorable = (text) => IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))

function makeHelpers(page, failures, stepName) {
    const expect = (condition, message) => {
        if (!condition) failures.push(`${stepName}: ${message}`);
    };

    /**
     * Wait for the URL path to match, by polling location rather than by
     * waiting on a navigation event.
     *
     * page.waitForURL waits for a `load` event by default, and a client-side
     * navigation never fires one -- which is the normal case here, since every
     * link is a next/link and the whole point is that the document is not
     * replaced. It appeared to work on desktop only because a load event from
     * the preceding goto happened to satisfy it.
     */
    const waitForPath = async (pattern) => {
        await page.waitForFunction(
            (source) => new RegExp(source).test(window.location.pathname),
            pattern.source,
            { timeout: options.timeout }
        );
    };

    // Identity of the live Mapbox canvas. Tagged once with a random id; if the
    // map is torn down and recreated, the tag is gone and a new one is issued,
    // which is exactly what we want to detect.
    const mapCanvasId = async () => {
        // Wait for the canvas rather than sampling for it: the persistence steps
        // read this straight after a navigation, and a null here would read as
        // "no map to compare" when the map is merely still starting.
        await page
            .waitForSelector('.mapboxgl-canvas', { timeout: options.timeout })
            .catch(() => null);
        return page.evaluate(() => {
            const canvas = document.querySelector('.mapboxgl-canvas');
            if (!canvas) return null;
            if (!canvas.dataset.shotId) {
                canvas.dataset.shotId = String(Math.random());
            }
            return canvas.dataset.shotId;
        });
    };

    // Probe the map for a rendered flight track and click it. Returns false when
    // there is nothing there, so a step can report "skipped" rather than fail
    // for a reason that is not a regression.
    const clickFirstTrack = async () => {
        // queryRenderedFeatures only sees what is currently painted, so the
        // tracks have to be on screen before we can aim at one.
        await page
            .waitForFunction(
                () => {
                    const map = window.__ploufbagMap;
                    return (
                        map &&
                        map.getLayer('flights-hit') &&
                        map.queryRenderedFeatures({ layers: ['flights-hit'] }).length > 0
                    );
                },
                { timeout: options.timeout }
            )
            .catch(() => null);

        const point = await page.evaluate(() => {
            const map = window.__ploufbagMap;
            if (!map) return null;
            const layers = ['flights-hit', 'flights-line'].filter((id) => map.getLayer(id));
            if (layers.length === 0) return null;
            const features = map.queryRenderedFeatures({ layers });
            if (features.length === 0) return null;

            // Aim somewhere the chrome is not. On a phone the sheet covers half
            // the viewport, so the midpoint of a track is very often behind it
            // and the click lands on the panel instead of the map. Rather than
            // guessing, verify the point with elementFromPoint: whatever is
            // actually on top there is what the click will hit.
            const canvas = map.getCanvas();
            const hits = (x, y) => {
                if (x < 4 || y < 4 || x > window.innerWidth - 4 || y > window.innerHeight - 4) {
                    return false;
                }
                const top = document.elementFromPoint(x, y);
                if (top !== canvas && !canvas.contains(top)) return false;
                // The point must belong to a track and nothing else. Site
                // markers sit on top of the tracks that start and end at them
                // and deliberately win the tie, so a point shared with one
                // navigates to the site -- a correct click, but not the one this
                // step is testing.
                if (!map.getLayer('sites-circle')) return true;
                return map.queryRenderedFeatures([x, y], { layers: ['sites-circle'] }).length === 0;
            };

            for (const feature of features.slice(0, 25)) {
                const geometry = feature.geometry;
                const coords =
                    geometry.type === 'LineString'
                        ? geometry.coordinates
                        : geometry.coordinates.flat();
                // Walk outwards from the middle: the ends of a track sit on the
                // takeoff and landing markers, which would navigate to a site.
                const middle = Math.floor(coords.length / 2);
                const order = [];
                for (let step = 0; step < middle; step++) {
                    order.push(middle - step, middle + step);
                }
                for (const index of order) {
                    const coordinate = coords[index];
                    if (!coordinate) continue;
                    const projected = map.project(coordinate);
                    if (hits(projected.x, projected.y)) {
                        return { x: projected.x, y: projected.y };
                    }
                }
            }
            return null;
        });

        if (!point) return false;
        await page.mouse.click(point.x, point.y);
        return true;
    };

    /**
     * Collapse the bottom sheet to its smallest snap, the way a user would when
     * they want the map. Returns false on desktop, where there is no handle and
     * the rail does not move.
     */
    const peekSheet = async () => {
        const handle = page.getByRole('button', { name: /Resize panel/ });
        if (!(await handle.isVisible().catch(() => false))) return false;
        for (let attempt = 0; attempt < SNAP_CYCLE_LENGTH; attempt++) {
            const label = (await handle.getAttribute('aria-label')) ?? '';
            if (label.includes('peek')) break;
            await handle.click();
            await page.waitForTimeout(320);
        }
        // Let the tiles that the newly revealed area needs come in.
        await page.waitForTimeout(900);
        return true;
    };

    const firstFlightHref = async () => {
        const href = await page
            .locator('a[href^="/flights/"]')
            .first()
            .getAttribute('href')
            .catch(() => null);
        return href;
    };

    // The map keeps painting long after the network settles, so `networkidle` is
    // not enough for a stable frame. Wait for Mapbox to say it is idle.
    //
    // Two waits, not one. MapCanvas publishes the instance from its load
    // handler, so immediately after a goto there is no map object yet --
    // checking for one and giving up is how this captured "Loading map..."
    // on every frame. Every route has a map now (it lives in the root layout),
    // so a map that never appears is a real failure, not a page without one.
    const waitForMapIdle = async (ambient = false) => {
        const appeared = await page
            .waitForFunction(() => Boolean(window.__ploufbagMap), { timeout: options.timeout })
            .then(() => true)
            .catch(() => false);

        if (!appeared) {
            failures.push(`${stepName}: map instance never appeared`);
            return;
        }

        // On ambient routes the camera never stops -- that is the feature -- so
        // waiting for the map to stop moving would always time out. Wait for the
        // tiles instead and accept a frame mid-rotation.
        await page
            .waitForFunction(
                (isAmbient) => {
                    const map = window.__ploufbagMap;
                    if (!map) return false;
                    if (isAmbient) return map.isStyleLoaded() && map.areTilesLoaded();
                    return map.loaded() && !map.isMoving() && !map.isZooming();
                },
                ambient,
                { timeout: options.timeout }
            )
            .catch(() => {
                failures.push(`${stepName}: map never reached idle`);
            });
        // Tile fade-in plus a frame to paint it. Longer than it looks like it
        // should need because this environment has no GPU and falls back to
        // software rendering.
        await page.waitForTimeout(1200);
    };

    return {
        expect,
        waitForPath,
        mapCanvasId,
        clickFirstTrack,
        peekSheet,
        firstFlightHref,
        waitForMapIdle,
    };
}

// ---------------------------------------------------------------------- main

async function runViewport(browser, viewportName, outDir, failures) {
    const context = await browser.newContext({
        viewport: {
            width: VIEWPORTS[viewportName].width,
            height: VIEWPORTS[viewportName].height,
        },
        isMobile: VIEWPORTS[viewportName].isMobile,
        deviceScaleFactor: VIEWPORTS[viewportName].deviceScaleFactor ?? 1,
        hasTouch: VIEWPORTS[viewportName].isMobile,
    });
    const page = await context.newPage();

    // A React error or a Mapbox style failure will otherwise show up as a
    // subtly wrong screenshot nobody notices. Surface them.
    const pageErrors = [];
    page.on('pageerror', (error) => {
        if (!isIgnorable(String(error))) pageErrors.push(String(error));
    });
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!isIgnorable(text)) pageErrors.push(`console: ${text}`);
    });

    // Expose the map for the helpers above. MapCanvas assigns
    // window.__ploufbagMap on load; before that exists this is simply absent and
    // the helpers degrade to timeouts.
    // A step that skips leaves the browser somewhere its dependents did not
    // expect -- 04 goes back through history that 03 was supposed to create. So
    // a skip has to cascade, rather than being reported as a failure of the
    // step that merely inherited it.
    const skipped = new Set();

    for (const step of TOUR) {
        if (options.only && !step.name.includes(options.only)) continue;

        const helpers = makeHelpers(page, failures, `${viewportName}/${step.name}`);
        let note = '';

        if (step.requires && skipped.has(step.requires)) {
            skipped.add(step.name);
            console.log(`  ${step.name}.${viewportName}.png (skipped: ${step.requires} skipped)`);
            continue;
        }

        const target = typeof step.path === 'function' ? await step.path(page, helpers) : step.path;
        if (target !== null && target !== undefined) {
            await page.goto(options.base + target, {
                waitUntil: 'domcontentloaded',
                timeout: options.timeout,
            });
        }

        if (step.act) {
            const result = (await step.act(page, helpers)) ?? {};
            if (result.skipped) {
                skipped.add(step.name);
                note = ` (skipped: ${result.skipped})`;
            }
        }

        await helpers.waitForMapIdle(Boolean(step.ambient));
        await hideDevOverlay(page);

        const file = path.join(outDir, `${step.name}.${viewportName}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`  ${path.basename(file)}${note}`);
    }

    if (pageErrors.length > 0) {
        // Deduplicate: React logs the same hydration complaint many times.
        for (const error of [...new Set(pageErrors)]) {
            failures.push(`${viewportName}: page error: ${error.slice(0, 300)}`);
        }
    }

    await context.close();
}

async function main() {
    const outDir = path.resolve(options.out);
    fs.mkdirSync(outDir, { recursive: true });

    // Fail fast with a clear message rather than 20 screenshots of a connection
    // error page.
    try {
        const response = await fetch(options.base, { redirect: 'manual' });
        if (response.status >= 500) {
            throw new Error(`dev server returned ${response.status}`);
        }
    } catch (error) {
        console.error(`Cannot reach ${options.base} -- is the dev server running?`);
        console.error(`  ${error.message}`);
        process.exit(1);
    }

    const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });

    const failures = [];
    const viewports = options.viewport ? [options.viewport] : Object.keys(VIEWPORTS);
    for (const viewportName of viewports) {
        if (!VIEWPORTS[viewportName]) {
            console.error(`unknown viewport ${viewportName}`);
            process.exit(1);
        }
        console.log(`==> ${viewportName}`);
        await runViewport(browser, viewportName, outDir, failures);
    }

    await browser.close();

    console.log(`\nScreenshots in ${outDir}`);
    if (failures.length > 0) {
        console.error(`\n${failures.length} failure(s):`);
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
    }
    console.log('All assertions passed.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
