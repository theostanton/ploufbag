import {NextRequest, NextResponse} from "next/server";
import {recordEvent} from "@database/analytics";
import {getCount} from "@database/pilots";
import {STRAVA_AUTHORIZE_URL, signupClickPath, signupState} from "@model/signup";

/**
 * The signup entry point. Every "Connect with Strava" button links here rather
 * than to strava.com directly, for two reasons:
 *
 *  - it is the one place a signup attempt can be recorded reliably. A
 *    client-side beacon fired on click races the navigation away from the page
 *    and loses events non-deterministically; a server round-trip cannot.
 *  - it is the one place the capacity gate can actually be enforced, rather
 *    than merely displayed.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Recorded before the capacity check on purpose: someone we had to turn
    // away still tried to sign up, and that is the demand signal worth having.
    //
    // The recorded path carries `?from=` when the press came from a detail-page
    // banner, so the funnel can tell those signups from home page ones. The
    // parameter is attacker-controlled, so signupClickPath allowlists it rather
    // than writing it through to analytics_events.path verbatim.
    const from = request.nextUrl.searchParams.get('from');
    await recordEvent('signup_click', signupClickPath(from), request.headers);

    let isOpen: boolean;
    try {
        isOpen = signupState(await getCount()).isOpen;
    } catch (error) {
        // Fail open. Strava enforces the real athlete cap at its own authorize
        // step, so the worst case is a visitor seeing Strava's error instead of
        // ours -- strictly better than our database being down meaning nobody
        // can sign up at all.
        console.error('connect: capacity check failed, allowing through:', error);
        isOpen = true;
    }

    if (!isOpen) {
        return NextResponse.redirect(new URL('/?full=1', request.url), 302);
    }

    return NextResponse.redirect(STRAVA_AUTHORIZE_URL, 302);
}
