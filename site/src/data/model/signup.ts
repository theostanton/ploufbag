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
