//
// Browser plumbing shared by dev/shots.mjs (the fixed tour) and dev/capture.mjs
// (one screenshot of one page, for visual QA).
//
// Both need the same things: a Playwright chromium that is not a project
// dependency, the same viewports, and a signed-in session that involves no
// Strava round trip -- plus the same idea of when the map is ready and which
// console errors are noise.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ------------------------------------------------------------------ playwright
//
// Playwright is installed globally rather than as a project dependency -- the
// site's package.json should not grow a browser automation dependency for a
// dev-only harness. Where "globally" is differs by machine: /opt/node22 in the
// remote agent containers, the npm prefix on a Mac (Homebrew or a per-user
// ~/.npm-global), or wherever PLAYWRIGHT_MODULE points.

function globalNodeModules() {
    try {
        return execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}

export function loadChromium() {
    const candidates = [
        process.env.PLAYWRIGHT_MODULE,
        '/opt/node22/lib/node_modules/playwright',
        'playwright',
    ];
    const globalRoot = globalNodeModules();
    if (globalRoot) candidates.push(path.join(globalRoot, 'playwright'));

    for (const candidate of candidates.filter(Boolean)) {
        try {
            return require(candidate).chromium;
        } catch {
            // try the next candidate
        }
    }
    console.error('playwright not found. Install it globally (npm install -g playwright),');
    console.error('or set PLAYWRIGHT_MODULE to the playwright package directory.');
    process.exit(1);
}

export function launchChromium(chromium) {
    return chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });
}

// --------------------------------------------------------------- page errors
//
// Both scripts treat a console error as a failure -- a screenshot of a broken
// page must not pass as evidence -- except for the noise below.

/**
 * Console noise that is a property of the environment rather than of the site.
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
export const IGNORED_CONSOLE_ERRORS = [
    /fonts\.googleapis\.com/,
    /ERR_CONNECTION_RESET/,
    // Same cause as ERR_CONNECTION_RESET, different symptom: outbound HTTPS
    // from the browser goes through this container's proxy, whose CA is not in
    // Chromium's store. Seeded pilots carry Strava CDN avatar URLs, so /pilots
    // trips this on every run. The site handles the failure -- PilotRow falls
    // back when the image errors -- which is exactly what a real expired
    // avatar URL does.
    /ERR_CERT_AUTHORITY_INVALID/,
    /Failed to fetch[\s\S]*\/api\/dev\/mapbox/,
    // An aborted tile request, identified by the stack pointing into
    // mapbox-gl. Matched on the stack rather than on the message alone so a
    // "Failed to fetch" from our own code still fails the run.
    /Failed to fetch[\s\S]*mapbox-gl/,
    /AbortError/,
    // Mapbox telemetry. Some networks (the Mac mini's included) refuse it, and
    // the map does not depend on it. Only matchable by URL: Chromium's
    // "Failed to load resource" message does not name the request, which is
    // why consoleErrorText appends the location.
    /events\.mapbox\.com/,
]

export const isIgnorable = (text) => IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text));

/** A console message's text plus the URL it came from, for matching above. */
export function consoleErrorText(message) {
    const { url } = message.location() ?? {};
    return url ? `${message.text()} (${url})` : message.text();
}

// ----------------------------------------------------------------------- map
//
// The map keeps painting long after the network settles, so `networkidle` is
// not enough for a stable frame. Wait for Mapbox to say it is idle.
//
// Two waits, not one. MapCanvas publishes the instance from its load handler,
// so immediately after a goto there is no map object yet -- checking for one and
// giving up is how the tour once captured "Loading map..." on every frame.
//
// `ambient` is true, false, or 'auto'. Returns null when the map is ready, or
// a description of what went wrong.

export async function waitForMap(page, { ambient = false, timeout = 45000, settle = 1200 } = {}) {
    const appeared = await page
        .waitForFunction(() => Boolean(window.__ploufbagMap), { timeout })
        .then(() => true)
        .catch(() => false);
    if (!appeared) return 'map instance never appeared';

    // On ambient routes the camera never stops -- that is the feature -- so
    // waiting for the map to stop moving would always time out. Wait for the
    // tiles instead and accept a frame mid-rotation. 'auto' asks the page:
    // MapCanvas marks an ambient scene with data-ambient.
    const idle = await page
        .waitForFunction(
            (mode) => {
                const map = window.__ploufbagMap;
                if (!map) return false;
                const isAmbient =
                    mode === true ||
                    (mode === 'auto' && Boolean(document.querySelector('[data-ambient="true"]')));
                if (isAmbient) return map.isStyleLoaded() && map.areTilesLoaded();
                return map.loaded() && !map.isMoving() && !map.isZooming();
            },
            ambient,
            { timeout }
        )
        .then(() => true)
        .catch(() => false);

    // Tile fade-in plus a frame to paint it. Longer than it looks like it should
    // need because headless Chromium here falls back to software rendering.
    await page.waitForTimeout(settle);
    return idle ? null : 'map never reached idle';
}

// ------------------------------------------------------------------- viewports
//
// The two breakpoints the designs are drawn at; see the Design Brief template.

export const VIEWPORTS = {
    desktop: { width: 1440, height: 900, isMobile: false },
    mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
};

export function contextOptionsFor(viewportName, extra = {}) {
    const viewport = VIEWPORTS[viewportName];
    if (!viewport) {
        console.error(`unknown viewport ${viewportName} (expected ${Object.keys(VIEWPORTS).join(' | ')})`);
        process.exit(1);
    }
    return {
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        hasTouch: viewport.isMobile,
        ...extra,
    };
}

// ------------------------------------------------------------------------ auth
//
// /dashboard and /welcome are behind middleware, and /admin only has anything
// to show for a signed-in visitor.
//
// The session is a plain HS256 JWT with the pilot id in `sub` (see
// data/auth/index.ts), signed with the same SESSION_SECRET the dev server was
// started with -- dev/site.sh defaults it, and this defaults it identically.
// Nothing here works against a deployment whose secret we do not have, which is
// the point.

const DEV_SESSION_SECRET =
    process.env.SESSION_SECRET || 'dev-session-secret-not-for-any-real-use';

/** The pilot the seed data gives the most flights; see dev/seed.mjs. */
export const TOUR_PILOT_ID = 4210001;

/** jose comes from the site's own node_modules -- it is already a dependency. */
export async function mintSessionCookie(pilotId = TOUR_PILOT_ID) {
    const siteRequire = createRequire(path.join(repoRoot, 'site', 'package.json'));
    let SignJWT;
    try {
        ({ SignJWT } = siteRequire('jose'));
    } catch {
        return null;
    }
    return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(pilotId))
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(new TextEncoder().encode(DEV_SESSION_SECRET));
}

export async function signIn(context, base, sessionCookie) {
    await context.addCookies([
        {
            name: 'sid',
            value: sessionCookie,
            url: base,
            httpOnly: true,
            sameSite: 'Lax',
        },
    ]);
}

/** Fail fast with a clear message rather than screenshots of a connection error. */
export async function assertReachable(base) {
    try {
        const response = await fetch(base, { redirect: 'manual' });
        if (response.status >= 500) {
            throw new Error(`dev server returned ${response.status}`);
        }
    } catch (error) {
        console.error(`Cannot reach ${base} -- is the dev server running? (dev/site.sh)`);
        console.error(`  ${error.message}`);
        process.exit(1);
    }
}
