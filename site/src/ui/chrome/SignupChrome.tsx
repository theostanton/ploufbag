import {Auth} from "@auth/index";
import {getCount} from "@database/pilots";
import {signupState} from "@model/signup";
import {BRAND_NAME} from "@ui/brand";
import ConnectWithStrava from "@ui/ConnectWithStrava";
import SignupCard from "./SignupCard";
import styles from "./SignupCard.module.css";

/**
 * The upsell, as floating chrome over the map.
 *
 * This used to be SignupBanner, rendered inside the panel on the flight, pilot
 * and site routes. Two problems with that: it pushed the content the visitor
 * actually came for down the panel, and it was absent from the list routes
 * where a first-time visitor spends most of their time.
 *
 * As chrome it sits over the map on every route, is the same element
 * everywhere, and can be dismissed — which the in-panel version could not be,
 * because a banner you cannot close in a panel you cannot leave is just a tax.
 *
 * Renders nothing at all when:
 *  - the visitor is signed in, since there is nothing to sell them; or
 *  - signups are at capacity, because the button would go to /connect, be
 *    turned away by Strava, and bounce them to the home page.
 */
export default async function SignupChrome() {
    // Checked first so a signed-in visitor costs no database round trip.
    if (await Auth.checkIsAuthed()) {
        return null;
    }

    // Fail open, matching /, /login and /connect: a database blip should not
    // decide whether we advertise. Strava enforces the real athlete cap anyway.
    const pilotCount = await getCount().catch(error => {
        console.error('SignupChrome: pilot count failed, showing signup anyway:', error);
        return 0;
    });

    const state = signupState(pilotCount);
    if (!state.isOpen) {
        return null;
    }

    return (
        <SignupCard>
            <p className={styles.headline}>Track your own flights</p>
            <p className={styles.body}>
                {BRAND_NAME} finds your paragliding flights on Strava, works out where you
                took off and landed, and writes the stats back onto your activity.
            </p>
            <div className={styles.action}>
                <ConnectWithStrava from="map" compact/>
                <p className={styles.spots}>
                    {state.spotsRemaining} of {state.capacity} early-access spots left
                </p>
            </div>
        </SignupCard>
    );
}
