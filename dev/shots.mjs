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
// entire premise of the redesign. For the flights list it compares the panel's
// structure across the server's HTML, hydration, a Los Angeles time zone, a
// dark preference and a session (see dev/README.md).
//
//   node dev/shots.mjs                      # whole tour, both viewports
//   node dev/shots.mjs --only flights       # steps whose name contains "flights"
//   node dev/shots.mjs --viewport mobile    # one viewport
//   node dev/shots.mjs --base http://localhost:3000 --out dev/shots
//
// Exits non-zero if any assertion fails or any page throws, so it can gate a
// commit.

import fs from 'node:fs';
import path from 'node:path';
import {
    VIEWPORTS,
    TOUR_PILOT_ID,
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

const chromium = loadChromium();

// /dashboard and /welcome are behind middleware, and /admin only has anything
// to show for a signed-in visitor, so without a session the tour photographed a
// redirect to /login three times and called it coverage. The authed steps run
// in a second context carrying a minted session; see dev/browser.mjs.

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

// ---------------------------------------------------------------------- tour

// What some steps search for. SEARCH is a landing field with flights in
// months the default view collapses; BACK_SEARCH matches enough rows to
// scroll the panel on either viewport.
const SEARCH = 'doussard';
const BACK_SEARCH = 'gin';

/** The custom colour db.sh gives pilot 4210001's Gin Bonanza 3 (#0d9488). */
const WING_COLOUR = 'rgb(13, 148, 136)';

/**
 * The seed's pinned flights either side of midnight in Paris, by the Paris
 * month they belong to (dev/seed.mjs). In Los Angeles every second one of each
 * pair is still on the previous day -- the previous month, or year.
 */
const MIDNIGHT_FLIGHTS = {
    15000015838: 'July 2026', // 31 Jul 23:35
    15000023757: 'August 2026', // 1 Aug 00:25
    15000031676: 'September 2026', // 30 Sep 23:50
    15000039595: 'October 2026', // 1 Oct 00:10
    15000047514: 'December 2025', // 31 Dec 23:40
    15000055433: 'January 2026', // 1 Jan 00:20
};

/**
 * Extra browser contexts, each signed out, for steps with `context: <name>`.
 * A preference like the time zone or colour scheme belongs to the context, so
 * it cannot be switched for one step in the shared one.
 */
const CONTEXTS = {
    la: { timezoneId: 'America/Los_Angeles' },
    dark: { colorScheme: 'dark' },
};


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
        // The month headings are the panel's structure for a screen reader: each
        // is an <h2>, so a heading jump moves month by month (AC 10). And the
        // list the server sends is the list that stays after hydration --
        // nothing in it should depend on the browser.
        name: '02-flights',
        path: '/flights',
        act: async (page, { expect, listStructure, serverStructure, waitForMapIdle }) => {
            await waitForMapIdle();
            const live = await listStructure();
            expect(live.months.length > 0, 'no month groups in the panel');
            const missing = [];
            for (const month of live.months) {
                const headings = await page
                    .getByRole('heading', { level: 2, name: month.heading ?? '', exact: true })
                    .count();
                if (headings !== 1) missing.push(month.heading);
            }
            expect(
                missing.length === 0,
                `${missing.length} of ${live.months.length} month headings are not one level-2 heading: ` +
                    missing.slice(0, 3).join(', ')
            );
            expect(
                live.months.some((month) => month.toggle),
                'no collapsed month: the default view should show older months as standouts'
            );
            expectSame(expect, await serverStructure('/flights'), live, 'server HTML', 'after hydration');
            return {};
        },
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
        act: async (page, { clickFirstTrack, expect, mapCanvasId, waitForPath, peekSheet, zoomToTrack }) => {
            const before = await mapCanvasId();
            let clicked = await clickFirstTrack();
            if (!clicked) {
                // On a phone the half-height sheet leaves too little map to hit
                // a thin track, which is exactly what the peek snap is for.
                // Collapsing and retrying is the real user flow, so test it
                // rather than skipping.
                if (await peekSheet()) clicked = await clickFirstTrack();
            }
            if (!clicked) {
                // At the camera's opening zoom on a phone (about 5) every point
                // of every track sits under a site marker, so the step skipped
                // on most runs. Zooming in on one track is what a reader does,
                // and it always leaves points that are only track.
                if (await zoomToTrack()) clicked = await clickFirstTrack();
            }
            if (!clicked) return { skipped: 'no track-only point visible even zoomed in on a track' };
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
        // A pilot's flights on one wing. db.sh gives this wing the custom colour
        // #0d9488, outside the hash palette, so the header's colour bar has to
        // come from wing_colour to match the rows -- it used to show the hash
        // colour (#22c55e) instead.
        name: '09c-pilot-wing',
        path: '/pilots/4210001/gin%20bonanza%203',
        act: async (page, { expect }) => {
            const heading = page.getByRole('heading', { level: 1, name: 'Gin Bonanza 3' });
            expect((await heading.count()) === 1, 'no "Gin Bonanza 3" heading on the pilot-wing page');
            const colours = await page.evaluate(() => {
                const colour = (element) => element && getComputedStyle(element).backgroundColor;
                return {
                    header: colour(document.querySelector('h1 > span[aria-hidden="true"]')),
                    rows: [...document.querySelectorAll('a[href^="/flights/"] + span[aria-hidden="true"]')]
                        .map(colour),
                };
            });
            expect(colours.rows.length > 0, 'no flights on the pilot-wing page');
            expect(
                colours.rows.every((colour) => colour === WING_COLOUR),
                `pilot-wing rows are not all the wing's colour ${WING_COLOUR}: ${[...new Set(colours.rows)]}`
            );
            expect(
                colours.header === WING_COLOUR,
                `pilot-wing header bar is ${colours.header}, not the wing's colour ${WING_COLOUR}`
            );
            return {};
        },
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
        // Flights / Default full sheet: the third snap, the list over the map.
        name: '09d-sheet-full',
        path: '/flights',
        act: async (page, { expect }) => {
            const handle = page.getByRole('button', { name: /Resize panel/ });
            if (!(await handle.isVisible().catch(() => false))) {
                return { skipped: 'no drag handle (desktop rail)' };
            }
            await handle.click();
            await page.waitForTimeout(600);
            const label = (await handle.getAttribute('aria-label')) ?? '';
            const height = (await page.locator('section[data-mode]').boundingBox())?.height ?? 0;
            expect(label.includes('full'), `one tap from half did not reach the full snap (${label})`);
            expect(
                height > page.viewportSize().height * 0.6,
                `full sheet is ${Math.round(height)}px tall`
            );
            return {};
        },
    },
    {
        name: '10-login',
        path: '/login',
        ambient: true,
    },

    // ------------------------------------------------------- chrome refinements

    {
        // The header no longer offers "Login". Everything here is public, so a
        // visitor reading the nav has no account to sign in to yet -- the offer
        // is "Connect Strava", and it goes through the same OAuth either way.
        name: '11-header-connect',
        path: '/flights',
        act: async (page, { expect }) => {
            const login = await page.getByRole('link', { name: 'Login', exact: true }).count();
            expect(login === 0, 'the Login link is back in the header');
            const connect = await page
                .getByRole('link', { name: /Connect Strava/i })
                .first()
                .isVisible()
                .catch(() => false);
            expect(connect, 'no Connect Strava button in the header');
            return {};
        },
    },
    {
        // A1, asserted so it cannot come back: the desktop rail lost its height
        // to a snap rule leaking out of the mobile block and rendered ~470px
        // tall on a 900px screen. It should fill the column.
        name: '11b-rail-height',
        path: '/flights',
        act: async (page, { expect }) => {
            const sheet = page.locator('section[data-mode]');
            const box = await sheet.boundingBox();
            if (!box) return { skipped: 'no chrome panel on this route' };
            const viewport = page.viewportSize();
            const mode = await sheet.getAttribute('data-mode');
            if (viewport.width < 1024) {
                // On a phone the sheet is meant to be short; that is the point.
                expect(box.height < viewport.height * 0.6, `mobile sheet is ${box.height}px tall`);
                return {};
            }
            expect(mode === 'sheet', `expected the rail on /flights, got data-mode=${mode}`);
            // Assert the geometry rather than a height in pixels: the rail is
            // pinned top and bottom, so what matters is that its bottom edge
            // reaches the bottom of the viewport. (Deriving an expected height
            // from --chrome-top does not work -- it is a calc() and comes back
            // as a string.)
            const bottomGap = viewport.height - (box.y + box.height);
            expect(
                bottomGap >= 0 && bottomGap < 24,
                `desktop rail stops ${Math.round(bottomGap)}px short of the viewport bottom`
            );
            expect(
                box.height > viewport.height * 0.8,
                `desktop rail is ${Math.round(box.height)}px in a ${viewport.height}px viewport`
            );
            return {};
        },
    },
    {
        // A4. A flight row is one stretched link with several real links on top
        // of it; the whole point is that the inner ones go somewhere else. This
        // fails if the stretched link swallows them again.
        name: '11c-inner-link',
        path: '/flights',
        act: async (page, { expect, waitForPath, peekSheet }) => {
            const inner = page.locator('a[href^="/sites/"]').first();
            if (!(await inner.isVisible().catch(() => false))) {
                return { skipped: 'no site link in the list' };
            }
            const href = await inner.getAttribute('href');
            await inner.click();
            const ok = await waitForPath(/^\/sites\/[^/]+$/)
                .then(() => true)
                .catch(() => false);
            expect(ok, `clicking ${href} inside a flight row did not open the site`);
            // Leave the browser somewhere predictable for the next step.
            await peekSheet();
            return {};
        },
    },
    {
        // B2. The filter narrows the list already in hand; no query, no request.
        // Older months are collapsed to their standouts, so a search is not a
        // subset of what is on screen: it opens every month it matches, shows
        // every match and drops the toggles, and clearing it puts the collapsed
        // view back exactly as it was.
        name: '11d-filter',
        path: '/flights',
        act: async (page, { expect, listStructure, waitForMapIdle }) => {
            await waitForMapIdle();
            const box = page.getByPlaceholder(/Search site, pilot or wing/i);
            if (!(await box.isVisible().catch(() => false))) {
                return { skipped: 'no filter input' };
            }
            const before = await listStructure();
            if (before.rows === 0) return { skipped: 'no flights in the list' };
            expect(before.months.some((month) => month.toggle), 'no collapsed month to search into');

            await box.fill(SEARCH);
            await page.waitForTimeout(300);
            const found = await listStructure();
            expectSearchResult(expect, found, SEARCH, before.total);
            expect(
                found.hrefs.some((href) => !before.hrefs.includes(href)),
                `"${SEARCH}" found nothing that the collapsed months were hiding`
            );

            await box.fill('zzzzzz');
            await page.waitForTimeout(300);
            const none = await listStructure();
            expect(none.rows === 0, `"zzzzzz" left ${none.rows} rows`);
            expect(none.noResults, 'no "No flights match" message for a search with no results');

            await box.fill('');
            await page.waitForTimeout(300);
            expectSame(expect, before, await listStructure(), 'before searching', 'after clearing');
            return {};
        },
    },
    {
        // Flights / No results, arriving by URL, and its way out.
        name: '11d2-no-results',
        path: '/flights?q=zzzzzz',
        act: async (page, { expect, listStructure, waitForMapIdle }) => {
            await waitForMapIdle();
            const none = await listStructure();
            expect(none.rows === 0 && none.noResults, '?q=zzzzzz did not show the no-results state');
            await page.getByRole('button', { name: 'Clear search' }).click();
            await page.waitForTimeout(300);
            const cleared = await listStructure();
            expect(cleared.rows > 0 && cleared.query === '', 'Clear search did not bring the list back');
            // Put the empty state back for the step's own frame.
            await page.goto(options.base + '/flights?q=zzzzzz', { waitUntil: 'domcontentloaded' });
            return {};
        },
    },
    {
        // A search is in the URL (PLOUF-35, AC 18), so a reload -- or a shared
        // link -- arrives with the list already filtered in the HTML the server
        // sends, not filtered a beat later by the client, and hydration changes
        // nothing. Flights / Search results.
        name: '11h-q-reload',
        path: `/flights?q=${SEARCH}`,
        act: async (page, { expect, listStructure, serverStructure, waitForMapIdle }) => {
            await page.reload({ waitUntil: 'domcontentloaded' });
            const server = await serverStructure(`/flights?q=${SEARCH}`, { reload: true });
            expectSearchResult(expect, server, SEARCH, null, 'server HTML');
            await waitForMapIdle();
            expectSame(expect, server, await listStructure(), 'server HTML', 'after hydration');
            return {};
        },
    },
    {
        // Back from a flight puts the reader where they were (PLOUF-35, AC 19):
        // the months they opened and the scroll position, so the first visible
        // row is the same. Once for a row at the bottom of the panel and once
        // for one at the top.
        //
        // The row is clicked by its coordinates, and only ever a row that is
        // actually visible in the panel. A locator click first scrolls its
        // target into view, which moves the panel before the click happens;
        // then the panel is restored to where Playwright put it rather than
        // where the reader left it (PLOUF-40).
        name: '11g-back-restores-scroll',
        path: '/flights',
        act: async (page, { expect, waitForPath, panelPosition, scrollPanel }) => {
            const more = page.getByRole('button', { name: /^Show all \d+ flights in / }).first();
            if (!(await more.isVisible().catch(() => false))) {
                return { skipped: 'no collapsed month to open' };
            }
            await more.click();
            for (const which of ['low', 'high']) {
                await scrollPanel(900);
                // Longer than the panel's save throttle.
                await page.waitForTimeout(400);
                const before = await panelPosition();
                if (!before?.[which]) return { skipped: 'no row visible in the panel' };
                await page.mouse.click(before[which].x, before[which].y);
                await waitForPath(/^\/flights\/\d+/);
                await page.waitForTimeout(800);
                await page.goBack({ waitUntil: 'commit' });
                await waitForPath(/^\/flights\/?$/);
                await page.waitForTimeout(800);
                const after = await panelPosition();
                expect(
                    after?.scrollTop === before.scrollTop && after?.first === before.first,
                    `back after clicking a ${which} row restored scrollTop ${after?.scrollTop} ` +
                        `(first row ${after?.first}), expected ${before.scrollTop} (${before.first})`
                );
            }
            return {};
        },
    },
    {
        // Back restores the search as well as the scroll: the text in the box,
        // the ?q= in the URL, the filtered list and the first visible row.
        name: '11i-back-restores-search',
        path: '/flights',
        act: async (page, { expect, waitForPath, panelPosition, scrollPanel, waitForMapIdle }) => {
            await waitForMapIdle();
            const box = page.getByPlaceholder(/Search site, pilot or wing/i);
            await box.fill(BACK_SEARCH);
            // Longer than the panel's save throttle and the URL update.
            await page.waitForTimeout(400);
            await scrollPanel(600);
            await page.waitForTimeout(400);
            const before = await panelPosition();
            if (!before?.high) return { skipped: 'no row visible in the panel' };
            expect(before.scrollTop > 0, `"${BACK_SEARCH}" did not give the panel anything to scroll`);
            // By position: a locator click would scroll the panel first.
            await page.mouse.click(before.high.x, before.high.y);
            await waitForPath(/^\/flights\/\d+/);
            await page.waitForTimeout(800);
            await page.goBack({ waitUntil: 'commit' });
            await waitForPath(/^\/flights\/?$/);
            await page.waitForTimeout(800);
            const after = await panelPosition();
            const value = await box.inputValue().catch(() => null);
            const q = new URL(page.url()).searchParams.get('q');
            expect(value === BACK_SEARCH, `back restored the search box as "${value}", not "${BACK_SEARCH}"`);
            expect(q === BACK_SEARCH, `back restored ?q=${q}, not ?q=${BACK_SEARCH}`);
            expect(
                after?.scrollTop === before.scrollTop && after?.first === before.first,
                `back restored scrollTop ${after?.scrollTop} (first row ${after?.first}), ` +
                    `expected ${before.scrollTop} (${before.first})`
            );
            return {};
        },
    },
    {
        // Flights / Month expanded: "Show all" opens a month in place.
        name: '11j-month-expanded',
        path: '/flights',
        act: async (page, { expect, listStructure, waitForMapIdle }) => {
            await waitForMapIdle();
            const before = await listStructure();
            const month = before.months.find((m) => m.toggle?.startsWith('Show all'));
            if (!month) return { skipped: 'no collapsed month to open' };
            const total = Number(month.toggle.match(/Show all (\d+)/)[1]);
            await page.getByRole('button', { name: month.toggle, exact: true }).click();
            await page.waitForTimeout(300);
            const opened = (await listStructure()).months.find((m) => m.id === month.id);
            expect(
                opened?.hrefs.length === total,
                `${month.heading} shows ${opened?.hrefs.length} rows after "${month.toggle}"`
            );
            expect(
                opened?.expanded === 'true' && opened?.toggle === 'Show standouts only',
                `${month.heading}'s toggle reads "${opened?.toggle}", aria-expanded=${opened?.expanded}`
            );
            return {};
        },
    },
    {
        // B3. Hovering a track should say what it is, not just thicken a line.
        name: '11e-hover-card',
        path: '/flights',
        act: async (page, { expect, hoverFirstTrack }) => {
            if (page.viewportSize().width < 1024) {
                return { skipped: 'the hover card is desktop-only; a phone has no pointer' };
            }
            if (!(await hoverFirstTrack())) return { skipped: 'no track-only point to hover' };
            const shown = await page
                .locator('[data-hover-card]')
                .waitFor({ state: 'visible', timeout: 4000 })
                .then(() => true)
                .catch(() => false);
            expect(shown, 'hovering a track did not show the hover card');
            return {};
        },
    },
    {
        // A3. The upsell is floating chrome now, dismissible, and the dismissal
        // has to survive a navigation or it is just an annoyance with a button.
        name: '11f-signup-chrome',
        path: '/flights',
        act: async (page, { expect, waitForPath }) => {
            const card = page.locator('aside[aria-label="Connect your Strava account"]');
            // The card renders nothing until its effect has read sessionStorage,
            // so it is absent for the first moments after domcontentloaded --
            // checking immediately reported "no signup chrome" on a page that
            // shows one a beat later.
            const appeared = await card
                .waitFor({ state: 'visible', timeout: 8000 })
                .then(() => true)
                .catch(() => false);
            if (!appeared) {
                return { skipped: 'no signup chrome (signed in, or at capacity)' };
            }
            await card.getByRole('button', { name: 'Dismiss' }).click();
            expect(!(await card.isVisible().catch(() => false)), 'dismiss did not hide the card');

            await page.getByRole('link', { name: 'Sites', exact: true }).click();
            await waitForPath(/^\/sites\/?$/);
            await page.waitForTimeout(400);
            expect(
                !(await card.isVisible().catch(() => false)),
                'the signup chrome came back after a navigation'
            );
            return {};
        },
    },

    // ------------------------------------------------- other browser contexts

    {
        // Months are Paris months wherever the reader is (AC 13). A browser in
        // Los Angeles is eight or nine hours behind, so the pinned flights just
        // after midnight in Paris are on the previous day there; anything that
        // formats in the browser's zone puts them in the wrong month, and shows
        // up first as a hydration mismatch against the server's HTML.
        name: '15-time-zone-la',
        path: '/flights',
        context: 'la',
        act: async (page, { expect, listStructure, serverStructure, waitForMapIdle }) => {
            const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
            expect(zone === 'America/Los_Angeles', `the context's time zone is ${zone}`);
            await waitForMapIdle();
            const live = await listStructure();
            expectSame(expect, await serverStructure('/flights'), live, 'server HTML', 'after hydration');

            // Open every month, then find each near-midnight flight.
            for (let i = 0; i < 40; i++) {
                const more = page.getByRole('button', { name: /^Show (all \d+ flights|1 flight) in / }).first();
                if (!(await more.isVisible().catch(() => false))) break;
                await more.click();
            }
            const months = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
                const row = document.querySelector(`a[href="/flights/${id}"]`);
                const section = row?.closest('section[aria-labelledby^="month-"]');
                return [id, section ? document.getElementById(section.getAttribute('aria-labelledby'))?.textContent ?? null : null];
            })), Object.keys(MIDNIGHT_FLIGHTS));
            for (const [id, month] of Object.entries(MIDNIGHT_FLIGHTS)) {
                expect(months[id] === month, `flight ${id} is under ${months[id]}, not ${month}`);
            }
            // Leave the default view for the frame.
            await page.reload({ waitUntil: 'domcontentloaded' });
            return {};
        },
    },
    {
        // The design is light only (VQA-24): a phone or desktop set to dark
        // still gets the light panels, not a half-dark mix.
        name: '16-dark-preference',
        path: '/flights',
        context: 'dark',
        act: async (page, { expect, referencePage, waitForMapIdle }) => {
            const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
            expect(dark, 'the context does not prefer a dark colour scheme');
            await waitForMapIdle();
            const light = await referencePage('/flights');
            const [want, got] = [await readStyles(light), await readStyles(page)];
            expect(
                got.body === 'rgb(245, 245, 240)',
                `body background is ${got.body} under a dark preference`
            );
            expectSame(expect, want, got, 'light preference', 'dark preference');
            return {};
        },
    },

    // ------------------------------------------------------------ authed routes

    {
        // A session changes the chrome around /flights, not the list (VQA-26):
        // same months, same counts, same rows in the same order as signed out.
        name: '12b-flights-signed-in',
        path: '/flights',
        authed: true,
        act: async (page, { expect, listStructure, referencePage, serverStructure, waitForMapIdle }) => {
            await waitForMapIdle();
            const live = await listStructure();
            expectSame(expect, await serverStructure('/flights'), live, 'server HTML', 'after hydration');
            const signedOut = await listStructure(await referencePage('/flights'));
            expectSame(expect, signedOut, live, 'signed out', 'signed in');
            return {};
        },
    },

    {
        name: '12-dashboard',
        path: '/dashboard',
        authed: true,
        act: async (page, { expect }) => {
            expect(
                new URL(page.url()).pathname.startsWith('/dashboard'),
                `/dashboard redirected to ${new URL(page.url()).pathname} -- session cookie rejected?`
            );
            return {};
        },
    },
    {
        name: '13-welcome',
        path: '/welcome',
        authed: true,
        ambient: true,
    },
    {
        name: '14-admin',
        path: '/admin',
        authed: true,
        act: async (page, { expect }) => {
            // The rebuild's whole reason for existing: this page was styled with
            // Tailwind classes that resolve to nothing, so it rendered as raw
            // markup. A styled tab strip is the cheapest proof it does not.
            // The page fetches before it can show anything, so give the tabs
            // time to replace the loading state rather than checking the frame
            // straight after domcontentloaded.
            const tab = page.getByRole('tab', { name: 'Webhooks' });
            const visible = await tab
                .waitFor({ state: 'visible', timeout: 15000 })
                .then(() => true)
                .catch(() => false);
            expect(visible, 'no tab strip on /admin');
            if (visible) await tab.click();
            await page.waitForTimeout(300);
            return {};
        },
    },
];

/**
 * The flights panel as structure: months, their headings and summaries, rows
 * by href and label in order, toggles, the search box and its count. Run in the
 * page. Comparing this rather than pixels is what makes the server-vs-hydrated
 * and signed-in-vs-out checks exact without being flaky.
 */
function readListStructure() {
    const text = (element) => element?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    const months = [...document.querySelectorAll('section[aria-labelledby^="month-"]')].map((section) => {
        const rows = [...section.querySelectorAll('a[href^="/flights/"]')];
        const toggle = section.querySelector('button[aria-expanded]');
        return {
            // The element the section is labelled by, whatever it is: the
            // heading step asserts that it is an <h2>, so it is not assumed.
            id: section.getAttribute('aria-labelledby'),
            heading: text(document.getElementById(section.getAttribute('aria-labelledby'))),
            summary: text(document.getElementById(section.getAttribute('aria-labelledby'))?.nextElementSibling),
            hrefs: rows.map((row) => row.getAttribute('href')),
            labels: rows.map((row) => row.getAttribute('aria-label')),
            toggle: text(toggle),
            expanded: toggle?.getAttribute('aria-expanded') ?? null,
        };
    });
    const input = document.querySelector('input[type="search"]');
    return {
        months,
        query: input ? input.value : null,
        count: text(input?.parentElement?.querySelector('[aria-live]')),
        noResults: /No flights match/.test(document.body.textContent),
    };
}

function summariseStructure(raw) {
    const hrefs = raw.months.flatMap((month) => month.hrefs);
    const total = Number(String(raw.count ?? '').split(' of ').pop()) || null;
    return { ...raw, hrefs, rows: hrefs.length, total };
}

/** Where two values first differ, as a path, or null when they are equal. */
function firstDifference(a, b, at = '') {
    if (Object.is(a, b)) return null;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return `${at || 'value'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const difference = firstDifference(a[key], b[key], `${at}${Array.isArray(a) ? `[${key}]` : `.${key}`}`);
        if (difference) return difference;
    }
    return null;
}

function expectSame(expect, a, b, aName, bName) {
    const difference = firstDifference(a, b);
    expect(difference === null, `${aName} and ${bName} differ at ${difference}`);
}

/** A search result: every match shown, months open, no toggles. */
function expectSearchResult(expect, list, query, total, where = 'the list') {
    expect(list.query === query, `${where}: the search box holds "${list.query}", not "${query}"`);
    expect(list.rows > 0, `${where}: "${query}" matched no rows`);
    const count = total === null ? new RegExp(`^${list.rows} of \\d+$`) : `${list.rows} of ${total}`;
    expect(
        typeof count === 'string' ? list.count === count : count.test(list.count ?? ''),
        `${where}: the count reads "${list.count}" with ${list.rows} rows shown`
    );
    expect(list.months.every((month) => month.toggle === null), `${where}: a month kept its toggle while searching`);
    expect(
        list.months.every((month) => /^\d+ of \d+ flights?\b/.test(month.summary ?? '')),
        `${where}: a month summary is not "N of M flights" while searching`
    );
    const stray = list.months.flatMap((month) => month.labels)
        .find((label) => !label?.toLowerCase().includes(query.toLowerCase()));
    expect(stray === undefined, `${where}: "${stray}" does not match "${query}"`);
}

/** Computed colours that tell the light design from a dark one. */
function readStyles(page) {
    return page.evaluate(() => {
        const css = (selector, property) => {
            const element = document.querySelector(selector);
            return element ? getComputedStyle(element)[property] : null;
        };
        return {
            body: css('body', 'backgroundColor'),
            text: css('body', 'color'),
            scheme: css(':root', 'colorScheme'),
            panel: css('section[data-mode]', 'backgroundColor'),
            header: css('header', 'backgroundColor'),
            heading: css('section[aria-labelledby^="month-"] [id^="month-"]', 'color'),
            input: css('input[type="search"]', 'backgroundColor'),
            inputText: css('input[type="search"]', 'color'),
        };
    });
}

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

/** Snap points in Sheet.tsx; the handle cycles through them in order. */
const SNAP_CYCLE_LENGTH = 3;

function makeHelpers(page, failures, stepName, env) {
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

    // Probe the map for a rendered flight track and return a viewport point on
    // it. Null when there is nothing there, so a step can report "skipped"
    // rather than fail for a reason that is not a regression.
    const findTrackPoint = async () => {
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

        return point;
    };

    const clickFirstTrack = async () => {
        const point = await findTrackPoint();
        if (!point) return false;
        await page.mouse.click(point.x, point.y);
        return true;
    };

    /**
     * Point at a track without clicking it. Two moves: the map's mousemove
     * handler compares against the feature it last saw, and a single jump onto
     * the line from wherever the pointer happened to be can arrive before the
     * first frame with the track painted under it.
     */
    const hoverFirstTrack = async () => {
        const point = await findTrackPoint();
        if (!point) return false;
        await page.mouse.move(point.x + 40, point.y + 40);
        await page.mouse.move(point.x, point.y, { steps: 8 });
        await page.waitForTimeout(200);
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

    const waitForMapIdle = async (ambient = false, target = page) => {
        const problem = await waitForMap(target, { ambient, timeout: options.timeout });
        if (problem) failures.push(`${stepName}: ${problem}`);
    };

    /**
     * Fit the camera to one rendered track, without animating, and wait for
     * the map to go idle there.
     */
    const zoomToTrack = async () => {
        const zoomed = await page.evaluate(() => new Promise((resolve) => {
            const map = window.__ploufbagMap;
            const feature = map?.getLayer('flights-hit') &&
                map.queryRenderedFeatures({ layers: ['flights-hit'] })[0];
            if (!feature) return resolve(false);
            const geometry = feature.geometry;
            const coords = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat();
            const xs = coords.map((c) => c[0]);
            const ys = coords.map((c) => c[1]);
            const timer = setTimeout(() => resolve(true), 10000);
            map.once('idle', () => { clearTimeout(timer); resolve(true); });
            map.fitBounds(
                [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
                { padding: 60, animate: false }
            );
        }));
        await page.waitForTimeout(300);
        return zoomed;
    };

    /**
     * The panel's scroll position and the first row whose top is inside it,
     * plus the centres of the lowest and highest rows wholly inside, to click
     * by position. The scroller is the sheet's or the rail's, not the document.
     */
    const panelPosition = () => page.evaluate(() => {
        let scroller = document.querySelector('a[href^="/flights/"]');
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
            scroller = scroller.parentElement;
        }
        if (!scroller) return null;
        const box = scroller.getBoundingClientRect();
        const rows = [...scroller.querySelectorAll('a[href^="/flights/"]')]
            .filter((row) => row.getBoundingClientRect().height > 0);
        const first = rows.find((row) => row.getBoundingClientRect().top >= box.top - 1);
        const inside = rows.filter((row) => {
            const r = row.getBoundingClientRect();
            return r.top >= box.top && r.bottom <= box.bottom;
        });
        const centre = (row) => {
            const r = row?.getBoundingClientRect();
            return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        return {
            scrollTop: scroller.scrollTop,
            first: first?.getAttribute('href') ?? null,
            low: centre(inside[inside.length - 1]),
            high: centre(inside[0]),
        };
    });

    /** Scroll the panel to `top`, or a third of the way down if that is less. */
    const scrollPanel = (top) => page.evaluate((top) => {
        let scroller = document.querySelector('a[href^="/flights/"]');
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
            scroller = scroller.parentElement;
        }
        if (scroller) scroller.scrollTop = Math.min(top, scroller.scrollHeight / 3);
    }, top);

    const listStructure = async (target = page) => summariseStructure(await target.evaluate(readListStructure));

    /**
     * The panel as the server sent it: the same URL in a context with
     * JavaScript off, so the DOM is the HTML and nothing else. It carries this
     * context's cookies, time zone and colour scheme.
     */
    const serverStructure = async (route, { reload = false } = {}) => {
        const context = await env.browser.newContext({ ...env.contextOptions, javaScriptEnabled: false });
        try {
            await context.addCookies(await page.context().cookies());
            const html = await context.newPage();
            await html.goto(options.base + route, { waitUntil: 'domcontentloaded', timeout: options.timeout });
            if (reload) await html.reload({ waitUntil: 'domcontentloaded', timeout: options.timeout });
            return await listStructure(html);
        } finally {
            await context.close();
        }
    };

    /**
     * The same route in a fresh signed-out context with no preferences -- the
     * reference that a dark or signed-in page is compared against. Closed when
     * the step ends; its console errors count like the step's own.
     */
    const referencePage = async (route) => {
        const context = await env.browser.newContext(contextOptionsFor(env.viewportName));
        env.opened.push(context);
        const reference = await context.newPage();
        env.watch(reference);
        await reference.goto(options.base + route, { waitUntil: 'domcontentloaded', timeout: options.timeout });
        await waitForMapIdle(false, reference);
        return reference;
    };

    return {
        expect,
        waitForPath,
        mapCanvasId,
        clickFirstTrack,
        hoverFirstTrack,
        peekSheet,
        firstFlightHref,
        waitForMapIdle,
        zoomToTrack,
        panelPosition,
        scrollPanel,
        listStructure,
        serverStructure,
        referencePage,
    };
}

// ---------------------------------------------------------------------- main

/**
 * Run a slice of the tour in one browser context.
 *
 * The tour is run twice per viewport, in two contexts: once signed out and once
 * with a session cookie. Two contexts rather than one, because the signed-out
 * assertions are about things a session removes -- the Connect button in the
 * header, the floating upsell -- so a single authed context would quietly turn
 * half the chrome checks into skips.
 */
async function runSteps(browser, context, contextOptions, steps, viewportName, outDir, failures, label) {
    if (steps.length === 0) return;

    const page = await context.newPage();

    // A React error or a Mapbox style failure will otherwise show up as a
    // subtly wrong screenshot nobody notices. Surface them, against the step
    // that was running. React 19 logs a hydration mismatch with console.error;
    // a warning that mentions hydration counts too, so a quieter one cannot
    // slip through.
    const pageErrors = new Set();
    let current = steps[0].name;
    const watch = (target) => {
        target.on('pageerror', (error) => {
            if (!isIgnorable(String(error))) pageErrors.add(`${current}${label}: page error: ${String(error)}`);
        });
        target.on('console', (message) => {
            const type = message.type();
            if (type !== 'error' && type !== 'warning') return;
            const text = consoleErrorText(message);
            if (type === 'warning' && !/hydrat/i.test(text)) return;
            if (!isIgnorable(text)) pageErrors.add(`${current}${label}: console ${type}: ${text}`);
        });
    };
    watch(page);

    // Expose the map for the helpers above. MapCanvas assigns
    // window.__ploufbagMap on load; before that exists this is simply absent and
    // the helpers degrade to timeouts.
    // A step that skips leaves the browser somewhere its dependents did not
    // expect -- 04 goes back through history that 03 was supposed to create. So
    // a skip has to cascade, rather than being reported as a failure of the
    // step that merely inherited it.
    const skipped = new Set();

    for (const step of steps) {
        current = step.name;
        const env = { browser, contextOptions, viewportName, opened: [], watch };
        const helpers = makeHelpers(page, failures, `${viewportName}/${step.name}${label}`, env);
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
        for (const opened of env.opened) await opened.close();
        console.log(`  ${path.basename(file)}${note}`);
    }

    for (const error of pageErrors) {
        failures.push(`${viewportName}/${error.slice(0, 400)}`);
    }

    await page.close();
}

async function runViewport(browser, viewportName, outDir, failures, sessionCookie) {
    const contextOptions = contextOptionsFor(viewportName);

    const wanted = TOUR.filter((step) => !options.only || step.name.includes(options.only));
    const anonymous = wanted.filter((step) => !step.authed && !step.context);
    const authed = wanted.filter((step) => step.authed);

    const context = await browser.newContext(contextOptions);
    await runSteps(browser, context, contextOptions, anonymous, viewportName, outDir, failures, '');
    await context.close();

    for (const [name, extra] of Object.entries(CONTEXTS)) {
        const steps = wanted.filter((step) => step.context === name);
        if (steps.length === 0) continue;
        const otherOptions = contextOptionsFor(viewportName, extra);
        const other = await browser.newContext(otherOptions);
        console.log(`  -- ${name}: ${JSON.stringify(extra)}`);
        await runSteps(browser, other, otherOptions, steps, viewportName, outDir, failures, ` (${name})`);
        await other.close();
    }

    if (authed.length === 0) return;

    if (!sessionCookie) {
        for (const step of authed) {
            console.log(`  ${step.name}.${viewportName}.png (skipped: could not mint a session)`);
        }
        return;
    }

    const authedContext = await browser.newContext(contextOptions);
    await signIn(authedContext, options.base, sessionCookie);
    console.log(`  -- signed in as pilot ${TOUR_PILOT_ID}`);
    await runSteps(browser, authedContext, contextOptions, authed, viewportName, outDir, failures, ' (authed)');
    await authedContext.close();
}

async function main() {
    const outDir = path.resolve(options.out);
    fs.mkdirSync(outDir, { recursive: true });

    await assertReachable(options.base);

    const browser = await launchChromium(chromium);

    const sessionCookie = await mintSessionCookie();
    if (!sessionCookie) {
        console.warn('Could not load jose from site/node_modules; authed steps will be skipped.');
    }

    const failures = [];
    const viewports = options.viewport ? [options.viewport] : Object.keys(VIEWPORTS);
    for (const viewportName of viewports) {
        if (!VIEWPORTS[viewportName]) {
            console.error(`unknown viewport ${viewportName}`);
            process.exit(1);
        }
        console.log(`==> ${viewportName}`);
        await runViewport(browser, viewportName, outDir, failures, sessionCookie);
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
