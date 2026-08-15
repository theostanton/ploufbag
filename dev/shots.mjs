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
        timeout: 20000,
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
        act: async (page, { expect, mapCanvasId }) => {
            const before = await mapCanvasId();
            if (before === null) return { skipped: 'no map instance (Mapbox token missing?)' };
            await page.getByRole('link', { name: 'Sites', exact: true }).click();
            await page.waitForURL(/\/sites\/?$/, { timeout: options.timeout });
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
        act: async (page, { clickFirstTrack, expect, mapCanvasId }) => {
            const before = await mapCanvasId();
            const clicked = await clickFirstTrack();
            if (!clicked) return { skipped: 'no track found on the map to click' };
            await page.waitForURL(/\/flights\/\d+/, { timeout: options.timeout });
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
        act: async (page, { expect, mapCanvasId }) => {
            const before = await mapCanvasId();
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await page.waitForURL(/\/flights\/?$/, { timeout: options.timeout });
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
        name: '08-pilots',
        path: '/pilots',
    },
    {
        name: '09-pilot-detail',
        path: '/pilots/4210001',
    },
    {
        name: '10-login',
        path: '/login',
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

function makeHelpers(page, failures, stepName) {
    const expect = (condition, message) => {
        if (!condition) failures.push(`${stepName}: ${message}`);
    };

    // Identity of the live Mapbox canvas. Tagged once with a random id; if the
    // map is torn down and recreated, the tag is gone and a new one is issued,
    // which is exactly what we want to detect.
    const mapCanvasId = async () =>
        page.evaluate(() => {
            const canvas = document.querySelector('.mapboxgl-canvas');
            if (!canvas) return null;
            if (!canvas.dataset.shotId) {
                canvas.dataset.shotId = String(Math.random());
            }
            return canvas.dataset.shotId;
        });

    // Probe the map for a rendered flight track and click it. Returns false when
    // there is nothing there, so a step can report "skipped" rather than fail
    // for a reason that is not a regression.
    const clickFirstTrack = async () => {
        const point = await page.evaluate(() => {
            const map = window.__ploufbagMap;
            if (!map) return null;
            const layers = ['flights-hit', 'flights-line'].filter((id) => map.getLayer(id));
            if (layers.length === 0) return null;
            const features = map.queryRenderedFeatures({ layers });
            if (features.length === 0) return null;
            const geometry = features[0].geometry;
            const coords = geometry.type === 'LineString'
                ? geometry.coordinates
                : geometry.coordinates.flat();
            const middle = coords[Math.floor(coords.length / 2)];
            const projected = map.project(middle);
            return { x: projected.x, y: projected.y };
        });
        if (!point) return false;
        await page.mouse.click(point.x, point.y);
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
    // not enough for a stable frame. Wait for Mapbox to say it is idle; fall
    // back to a short settle when there is no map on the page.
    const waitForMapIdle = async () => {
        const hasMap = await page.evaluate(() => Boolean(window.__ploufbagMap));
        if (!hasMap) {
            await page.waitForTimeout(400);
            return;
        }
        await page
            .waitForFunction(
                () => {
                    const map = window.__ploufbagMap;
                    return map && map.loaded() && !map.isMoving() && !map.isZooming();
                },
                { timeout: options.timeout }
            )
            .catch(() => {
                failures.push(`${stepName}: map never reached idle`);
            });
        // One more frame after idle, so tile fades have finished.
        await page.waitForTimeout(300);
    };

    return { expect, mapCanvasId, clickFirstTrack, firstFlightHref, waitForMapIdle };
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
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
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

        await helpers.waitForMapIdle();
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
