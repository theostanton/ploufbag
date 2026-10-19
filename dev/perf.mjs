#!/usr/bin/env node
//
// /flights at scale: scroll the panel under a slow CPU and fail on any long task.
//
// The list is not virtualised (rejected in the Implementation Plan), so every
// flight is in the DOM. What keeps that cheap is content-visibility on the month
// groups and memoised rows; this is the check that it stays cheap. Run it
// against the 1,000-flight fixture:
//
//   dev/db.sh reseed --flights 1000
//   node dev/perf.mjs                                  # both passes, desktop
//   node dev/perf.mjs --viewport mobile
//   node dev/perf.mjs --base http://localhost:3001     # e.g. a `next start` build
//   node dev/perf.mjs --pass expanded --budget 100 --throttle 4
//
// Two passes, each on a fresh page:
//   default   -- the view a reader arrives at: newest month open, older months
//                showing their standouts.
//   expanded  -- every month opened with its "Show all" button first, so the
//                whole season is in the panel.
//
// In each, CPU is throttled through CDP (Emulation.setCPUThrottlingRate), the
// panel's scroller is stepped from top to bottom, and every `longtask` entry is
// recorded. A task longer than the budget, or any console error, fails the run.
//
// Only the scroll is judged. Hydrating 1,000 rows under a 4x throttle is one
// long task by nature, and it is reported, not gated: the question here is
// whether reading the list stutters. Opening months is reported the same way --
// each click renders a month's rows, which is work the reader asked for -- and
// so is the map settling, which the scroll waits for (see run() for why the map
// has to be kept out of the measurement, and dev/README.md).

import {
    assertReachable,
    consoleErrorText,
    contextOptionsFor,
    isIgnorable,
    launchChromium,
    loadChromium,
    waitForMap,
} from './browser.mjs';

function parseArgs(argv) {
    const options = {
        base: 'http://localhost:3000',
        viewport: 'desktop',
        throttle: '4',
        budget: '100',
        step: '0.8',
        pause: '120',
        pass: 'all',
        pointer: 'away',
    };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        if (!(key in options)) {
            console.error(`unknown option --${key}`);
            console.error('usage: node dev/perf.mjs [--base <url>] [--viewport desktop|mobile] [--throttle 4]');
            console.error('       [--budget <ms>] [--step <fraction of the scroller height>] [--pause <ms>]');
            console.error('       [--pass all|default|expanded] [--pointer away|over]');
            process.exit(1);
        }
        options[key] = argv[i + 1];
    }
    if (!['all', 'default', 'expanded'].includes(options.pass)) {
        console.error(`unknown --pass ${options.pass} (expected all | default | expanded)`);
        process.exit(1);
    }
    if (!['away', 'over'].includes(options.pointer)) {
        console.error(`unknown --pointer ${options.pointer} (expected away | over)`);
        process.exit(1);
    }
    return {
        ...options,
        throttle: Number(options.throttle),
        budget: Number(options.budget),
        step: Number(options.step),
        pause: Number(options.pause),
    };
}

const options = parseArgs(process.argv.slice(2));

/** Installed before any page script, so tasks during load are seen too. */
function observeLongTasks() {
    window.__longTasks = [];
    window.__phase = 'load';
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            window.__longTasks.push({
                phase: window.__phase,
                start: Math.round(entry.startTime),
                duration: Math.round(entry.duration),
            });
        }
    }).observe({ type: 'longtask', buffered: true });
}

/**
 * Until no long task has started for `quietMs`, or `timeout`: for a production
 * build, where the map is not exposed to wait on. Null when quiet.
 */
async function waitForQuiet(page, { quietMs = 3000, timeout = 180000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const lastEnd = await page.evaluate(() =>
            window.__longTasks.reduce((max, task) => Math.max(max, task.start + task.duration), 0)
        );
        const now = await page.evaluate(() => performance.now());
        if (now - lastEnd >= quietMs) return null;
        await page.waitForTimeout(500);
    }
    return `main thread never went quiet for ${quietMs} ms`;
}

async function run(browser, pass) {
    const context = await browser.newContext(contextOptionsFor(options.viewport));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = consoleErrorText(message);
        if (!isIgnorable(text)) errors.push(`console.error: ${text}`);
    });
    await page.addInitScript(observeLongTasks);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.throttle });

    const loadStart = Date.now();
    await page.goto(`${options.base}/flights`, { waitUntil: 'load', timeout: 180000 });
    await page.locator('a[href^="/flights/"]').first().waitFor({ timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    const loadMs = Date.now() - loadStart;

    // Then the map: fetching, drawing and framing every track. Under the
    // throttle that is several seconds of long tasks from mapbox-gl on its own,
    // with the panel untouched, and scrolling during it would charge them to
    // the list. Measured and reported separately (phase `map`).
    const mapStart = await page.evaluate(() => {
        window.__phase = 'map';
        return performance.now();
    });
    // A dev server hands the map to the page (window.__ploufbagMap) and we wait
    // for it to say idle. A production build does not, so there it is the
    // main thread going quiet instead.
    const hooked = await page
        .waitForFunction(() => Boolean(window.__ploufbagMap), { timeout: 20000 })
        .then(() => true)
        .catch(() => false);
    const settled = hooked ? waitForMap(page, { ambient: 'auto', timeout: 180000, settle: 500 }) : waitForQuiet(page);
    const mapProblem = await settled;
    if (mapProblem) errors.push(`map: ${mapProblem}`);
    // To the end of its last long task when settled by quiet, since the quiet
    // window itself (and the wait for a hook that never came) is not map work.
    const mapMs = Math.round(await page.evaluate(({ start, hooked }) => hooked
        ? performance.now() - start
        : window.__longTasks
            .filter((task) => task.phase === 'map')
            .reduce((max, task) => Math.max(max, task.start + task.duration), start) - start,
    { start: mapStart, hooked }));

    let opened = 0;
    if (pass === 'expanded') {
        await page.evaluate(() => (window.__phase = 'expand'));
        // One at a time, as a reader would, each click waiting for its render.
        // Re-queried every time: opening a month turns its button into "Show
        // standouts only".
        const more = page.getByRole('button', { name: /^Show (all \d+ flights|1 flight) in / });
        for (;;) {
            const count = await more.count();
            if (count === 0) break;
            await more.first().click();
            opened += 1;
            await page.waitForTimeout(50);
        }
    }

    // Where the pointer is during the scroll. Rows passing under a pointer
    // hover their flights, and the map redraws every hover; in this headless
    // Chromium WebGL is software (SwiftShader), so each redraw of 1,000 tracks
    // is a ~300 ms task on the main thread that a GPU would not charge there.
    // `away` (the default) parks it on the top bar so the scroll measures the
    // list; `over` leaves it on the panel, to measure that map cost instead.
    // The scroller's box, not a row's: once months are open the first row is
    // scrolled out of sight.
    const box = await page.evaluate(() => {
        let element = document.querySelector('a[href^="/flights/"]');
        while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY)) {
            element = element.parentElement;
        }
        const rect = element?.getBoundingClientRect();
        return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (options.pointer === 'over' && box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
        await page.mouse.move(Math.round(contextOptionsFor(options.viewport).viewport.width / 2), 2);
    }
    // Any hover the move ended, and any month just opened, drawn before measuring.
    if (hooked) await waitForMap(page, { timeout: 60000, settle: 500 });
    else await waitForQuiet(page);

    const scrolled = await page.evaluate(async ({ step, pause }) => {
        const first = document.querySelector('a[href^="/flights/"]');
        let scroller = first;
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
            scroller = scroller.parentElement;
        }
        if (!scroller) return null;
        scroller.scrollTop = 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.__phase = 'scroll';
        const distance = Math.max(1, Math.round(scroller.clientHeight * step));
        let steps = 0;
        // scrollHeight is re-read every step: content-visibility settles the
        // real size of each month as it comes into view.
        while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) {
            const before = scroller.scrollTop;
            scroller.scrollTop = before + distance;
            steps += 1;
            await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, pause)));
            if (scroller.scrollTop === before) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.__phase = 'done';
        return {
            steps,
            scrollHeight: scroller.scrollHeight,
            rows: scroller.querySelectorAll('a[href^="/flights/"]').length,
            months: scroller.querySelectorAll('section h2').length,
        };
    }, { step: options.step, pause: options.pause });

    const tasks = await page.evaluate(() => window.__longTasks);
    await context.close();

    if (!scrolled) errors.push('no scroller found around the flight rows');
    const by = (phase) => tasks.filter((task) => task.phase === phase);
    const longest = (list) => list.reduce((max, task) => Math.max(max, task.duration), 0);
    const scrollTasks = by('scroll');
    const overBudget = scrollTasks.filter((task) => task.duration > options.budget);

    return {
        pass,
        loadMs,
        mapMs,
        settledBy: hooked ? 'map idle' : 'main thread quiet',
        opened,
        ...scrolled,
        load: { count: by('load').length, longest: longest(by('load')) },
        map: { count: by('map').length, longest: longest(by('map')), total: by('map').reduce((sum, task) => sum + task.duration, 0) },
        expand: { count: by('expand').length, longest: longest(by('expand')) },
        scroll: { count: scrollTasks.length, longest: longest(scrollTasks) },
        overBudget,
        errors,
        ok: errors.length === 0 && overBudget.length === 0,
    };
}

function report(result) {
    const verdict = result.ok ? 'PASS' : 'FAIL';
    console.log(`\n${verdict}  ${result.pass}  (${options.viewport}, CPU ${options.throttle}x, ` +
        `budget ${options.budget} ms, pointer ${options.pointer})`);
    console.log(`  rows in DOM ${result.rows ?? '?'}, months ${result.months ?? '?'}, ` +
        `scrollHeight ${result.scrollHeight ?? '?'} px, ${result.steps ?? '?'} scroll steps`);
    if (result.pass === 'expanded') console.log(`  months opened ${result.opened}`);
    console.log(`  load    ${result.loadMs} ms; long tasks ${result.load.count}, longest ${result.load.longest} ms (not gated)`);
    console.log(`  map     ${result.mapMs} ms to ${result.settledBy}; long tasks ${result.map.count}, longest ${result.map.longest} ms, ` +
        `${result.map.total} ms in all (not gated)`);
    if (result.pass === 'expanded') {
        console.log(`  expand  long tasks ${result.expand.count}, longest ${result.expand.longest} ms (not gated)`);
    }
    console.log(`  scroll  long tasks ${result.scroll.count}, longest ${result.scroll.longest} ms`);
    for (const task of result.overBudget) {
        console.log(`    over budget: ${task.duration} ms at ${task.start} ms`);
    }
    for (const error of result.errors) console.log(`    ${error}`);
}

async function main() {
    await assertReachable(options.base);
    const browser = await launchChromium(loadChromium());
    const passes = options.pass === 'all' ? ['default', 'expanded'] : [options.pass];
    const results = [];
    try {
        for (const pass of passes) {
            const result = await run(browser, pass);
            report(result);
            results.push(result);
        }
    } finally {
        await browser.close();
    }
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passes within budget`);
    process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
