/**
 * Signup capacity, and the one place the Strava OAuth URL is built.
 *
 * The cap is not ours to choose. Strava enforces an athlete capacity per API
 * application: new apps start at 1 ("single player mode"), a self-serve upgrade
 * in the API dashboard raises it to 10, and anything beyond that needs an
 * approved Developer Program request. This app is on the self-serve tier.
 *
 * Strava rejects athlete number 11 at its own /oauth/authorize step, before any
 * code reaches our webhooks service, so ATHLETE_CAPACITY does not *create* the
 * limit -- it just lets us stop offering a button Strava would refuse, and show
 * how many spots are left instead. Raising this number alone therefore does not
 * open more signups; it only re-exposes a button that then fails on Strava's
 * side. Get the capacity increase approved first, then change this.
 */
export const ATHLETE_CAPACITY = 10;

const STRAVA_CLIENT_ID = "155420";

/**
 * The webhooks service, which handles the `code` callback in handleCode.ts.
 * Must stay byte-identical to the "Authorization Callback Domain" configured in
 * the Strava API settings dashboard, or Strava rejects the authorize request.
 */
const OAUTH_REDIRECT_URI = "https://webhooks.ploufbag.com";

const OAUTH_SCOPE = "read_all,activity:write,activity:read_all";

/**
 * Assembled by concatenation rather than URLSearchParams on purpose: this
 * reproduces the string that was previously inlined in the login page exactly,
 * including the unescaped commas and colons in `scope`. URLSearchParams would
 * percent-encode those, which is a change to a URL that currently works.
 */
export const STRAVA_AUTHORIZE_URL =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${STRAVA_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&approval_prompt=force` +
    `&scope=${OAUTH_SCOPE}`;

/**
 * Where a "Connect with Strava" press came from, so the funnel can tell a home
 * page signup apart from one the detail-page banner earned.
 *
 * An allowlist rather than free text because the value arrives as a query
 * parameter and is written straight into analytics_events.path. Without it,
 * anyone could hand-craft /connect?from=... and write arbitrary strings into
 * the analytics table. Members are therefore added deliberately, one at a time:
 *
 *  - flight | pilot | site: the detail routes strangers reach from a Strava
 *    description.
 *  - header: the top-bar button, which is on every route.
 *  - map: the floating upsell on a list or overview route, where there is no
 *    single entity to attribute the click to.
 */
export const SIGNUP_SOURCES = ['flight', 'pilot', 'site', 'header', 'map'] as const;

export type SignupSource = typeof SIGNUP_SOURCES[number];

/** The href a signup button should point at, tagged with its origin. */
export function connectHref(source?: SignupSource): string {
    return source ? `/connect?from=${source}` : '/connect';
}

/**
 * The path to record for a signup click, given the untrusted `from` parameter.
 * Anything not on the allowlist is recorded as a plain /connect.
 */
export function signupClickPath(from: string | null): string {
    return (SIGNUP_SOURCES as readonly string[]).includes(from ?? '')
        ? `/connect?from=${from}`
        : '/connect';
}

export type SignupState = {
    /** Whether we should be offering the Strava button at all. */
    isOpen: boolean;
    pilotCount: number;
    capacity: number;
    /** Never negative, so it is safe to render directly. */
    spotsRemaining: number;
};

export function signupState(pilotCount: number): SignupState {
    const spotsRemaining = Math.max(0, ATHLETE_CAPACITY - pilotCount);
    return {
        isOpen: spotsRemaining > 0,
        pilotCount,
        capacity: ATHLETE_CAPACITY,
        spotsRemaining,
    };
}
