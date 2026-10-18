//
// Browser plumbing shared by dev/shots.mjs (the fixed tour) and dev/capture.mjs
// (one screenshot of one page, for visual QA).
//
// Both need the same three things: a Playwright chromium that is not a project
// dependency, the same viewports, and a signed-in session that involves no
// Strava round trip.

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
