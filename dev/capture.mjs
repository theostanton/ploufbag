#!/usr/bin/env node
//
// One screenshot of one page, under exactly stated conditions.
//
// This is the camera for visual QA: each visual acceptance criterion (VQA-n)
// names a page, a state, a breakpoint and a theme, and the build screenshot that
// goes next to the approved design has to be taken under those same conditions.
// dev/shots.mjs is a fixed tour and a regression check; this is the ad-hoc
// counterpart an agent or a person can point at any route.
//
//   node dev/capture.mjs --path /flights --viewport mobile --out vqa-07.png
//   node dev/capture.mjs --path /dashboard --pilot 4210001 --out dash.png
//   node dev/capture.mjs --path /sites --theme dark --full-page true --out sites.png
//   node dev/capture.mjs --path /flights --wait-for "[data-testid=flight-list]" --out f.png
//
// --pilot signs in as that pilot (any id from dev/seed.mjs); omit it to capture
// what a logged-out visitor sees. Exits non-zero if the page throws, so a
// screenshot of a crashed page is never mistaken for evidence.

import fs from 'node:fs';
import path from 'node:path';
import {
    assertReachable,
    consoleErrorText,
    contextOptionsFor,
    isIgnorable,
    launchChromium,
    loadChromium,
    mintSessionCookie,
    signIn,
    waitForMap,
} from './browser.mjs';

function parseArgs(argv) {
    const options = {
        base: 'http://localhost:3000',
        path: null,
        out: null,
        viewport: 'desktop',
        theme: 'light',
        pilot: null,
        'wait-for': null,
        'full-page': 'false',
        map: 'auto',
        settle: '1200',
        timeout: '45000',
    };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        if (!(key in options)) {
            console.error(`unknown option --${key}`);
            process.exit(1);
        }
        options[key] = argv[i + 1];
    }
    if (!options.path || !options.out) {
        console.error('usage: node dev/capture.mjs --path <route> --out <file.png> [--viewport desktop|mobile]');
        console.error('       [--theme light|dark] [--pilot <id>] [--wait-for <selector>] [--full-page true]');
        console.error('       [--map auto|ambient|none] [--settle <ms>]');
        process.exit(1);
    }
    if (!['auto', 'ambient', 'none'].includes(options.map)) {
        console.error(`unknown --map ${options.map} (expected auto | ambient | none)`);
        process.exit(1);
    }
    if (!['light', 'dark'].includes(options.theme)) {
        console.error(`unknown theme ${options.theme} (expected light | dark)`);
        process.exit(1);
    }
    return options;
}

const options = parseArgs(process.argv.slice(2));

async function main() {
    await assertReachable(options.base);

    const chromium = loadChromium();
    const browser = await launchChromium(chromium);
    const context = await browser.newContext(
        contextOptionsFor(options.viewport, { colorScheme: options.theme })
    );

    if (options.pilot) {
        const sessionCookie = await mintSessionCookie(Number(options.pilot));
        if (!sessionCookie) {
            console.error('Could not load jose from site/node_modules -- run yarn install in site/.');
            process.exit(1);
        }
        await signIn(context, options.base, sessionCookie);
    }

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => {
        if (!isIgnorable(String(error))) pageErrors.push(error.message);
    });
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = consoleErrorText(message);
        if (!isIgnorable(text)) pageErrors.push(text);
    });

    const url = new URL(options.path, options.base).toString();
    await page.goto(url, { waitUntil: 'networkidle', timeout: Number(options.timeout) });
    if (options['wait-for']) {
        await page.waitForSelector(options['wait-for'], { timeout: Number(options.timeout) });
    }
    // Every route has the map (it lives in the root layout), and it keeps
    // painting long after network idle -- a fixed delay caught "Loading map..."
    // on a slow machine. Wait for Mapbox itself. `auto` detects routes whose
    // camera never stops (home, login, welcome); `none` skips the wait.
    let mapProblem = null;
    if (options.map === 'none') {
        await page.waitForTimeout(Number(options.settle));
    } else {
        mapProblem = await waitForMap(page, {
            ambient: options.map === 'ambient' ? true : 'auto',
            timeout: Number(options.timeout),
            settle: Number(options.settle),
        });
    }

    const out = path.resolve(options.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage: options['full-page'] === 'true' });

    const finalPath = new URL(page.url()).pathname;
    await browser.close();

    console.log(`${out}`);
    console.log(`  url: ${url}${finalPath !== new URL(url).pathname ? ` (redirected to ${finalPath})` : ''}`);
    console.log(`  viewport: ${options.viewport} · theme: ${options.theme} · ${options.pilot ? `pilot ${options.pilot}` : 'logged out'}`);

    if (mapProblem) {
        console.error(`\n${mapProblem} -- this screenshot may show the map half-drawn.`);
        process.exit(1);
    }

    if (pageErrors.length > 0) {
        console.error(`\n${pageErrors.length} page error(s) -- this screenshot is not valid evidence:`);
        for (const error of [...new Set(pageErrors)]) console.error(`  - ${error.slice(0, 300)}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
