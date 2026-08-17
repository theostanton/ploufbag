import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {getCount} from "@database/pilots";
import {Sites} from "@database/Sites";
import {signupState} from "@model/signup";
import MapScene from "@ui/map/MapScene";
import Pitch from "@ui/chrome/Pitch";
import styles from "@ui/chrome/Pitch.module.css";

export const metadata: Metadata = createMetadata('Sign in')

/**
 * Reads the live pilot count for the capacity gate, so it must not be cached
 * into a page that keeps offering a full signup.
 */
export const dynamic = 'force-dynamic';

/**
 * Where middleware sends someone who asked for /dashboard or /welcome without a
 * session.
 *
 * No longer linked from the nav — the header offers "Connect Strava" instead,
 * because everything on this site is public and a visitor reading the nav has
 * no account to sign in to yet. This route exists for the redirect, and its job
 * is to explain why the visitor is suddenly here rather than where they asked
 * to go.
 *
 * Connecting is also how a returning pilot signs in: /connect sends them
 * through Strava's OAuth either way, so there is no separate sign-in form to
 * offer and never was.
 */
export default async function Login() {
    // Fail open, matching / and /connect: a database blip should not hide the
    // only way in. Strava still enforces the real athlete cap.
    const pilotCount = await getCount().catch(error => {
        console.error('login: pilot count failed, showing signup anyway:', error);
        return 0;
    });
    const state = signupState(pilotCount);
    const heroBounds = await Sites.getBusiestBounds();

    return (
        <>
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>
            <Pitch
                state={state}
                notice={
                    <div className={styles.full}>
                        <strong>That page needs a connected account.</strong>
                        <p>
                            Connect with Strava to reach it. If you have connected before, this is
                            also how you sign back in.
                        </p>
                    </div>
                }
            />
        </>
    );
}
