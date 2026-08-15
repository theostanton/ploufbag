import {Auth} from "@auth/index";
import {getCount} from "@database/pilots";
import {signupState, SignupSource} from "@model/signup";
import {BRAND_NAME} from "@ui/brand";
import ConnectWithStrava from "@ui/ConnectWithStrava";
import styles from "@ui/SignupBanner.module.css";

/**
 * The upsell shown at the top of flight, pilot and site detail pages.
 *
 * These pages became worth showing to strangers when flight descriptions on
 * Strava started linking straight to them (ploufbag.com/<slug>) instead of to
 * the landing page. A visitor arriving that way lands on someone else's flight
 * having never seen the pitch, so the pitch has to come to them.
 *
 * Renders nothing at all when:
 *  - the visitor is signed in, since there is nothing to sell them; or
 *  - signups are at capacity, because the button would go to /connect, be
 *    turned away, and bounce them to the home page. Offering a door that is
 *    known to be locked is worse on a page they came to for other reasons than
 *    on the home page, where signing up is the whole point.
 */
export default async function SignupBanner({from}: { from: SignupSource }) {
    // Checked first so that a signed-in visitor costs no database round trip.
    if (await Auth.checkIsAuthed()) {
        return null;
    }

    // Fail open, matching /, /login and /connect: a database blip should not
    // decide whether we advertise. Strava enforces the real athlete cap anyway.
    const pilotCount = await getCount().catch(error => {
        console.error('SignupBanner: pilot count failed, showing signup anyway:', error);
        return 0;
    });

    const state = signupState(pilotCount);
    if (!state.isOpen) {
        return null;
    }

    return (
        <aside className={styles.banner} aria-label={`Sign up for ${BRAND_NAME}`}>
            <div className={styles.text}>
                <p className={styles.headline}>Track your own flights</p>
                <p className={styles.body}>
                    {BRAND_NAME} finds your paragliding flights on Strava, works out where you took
                    off and landed, and writes the stats back onto your activity.
                </p>
            </div>
            <div className={styles.action}>
                <ConnectWithStrava from={from} compact/>
                <p className={styles.spots}>
                    Early access &mdash; {state.spotsRemaining} of {state.capacity} spots left
                </p>
            </div>
        </aside>
    );
}
