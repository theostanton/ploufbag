import {headers} from "next/headers";
import styles from "@styles/Page.module.css";
import {BRAND_NAME} from "@ui/brand";
import ConnectWithStrava from "@ui/ConnectWithStrava";
import {recordEvent} from "@database/analytics";
import {getCount} from "@database/pilots";
import {Sites} from "@database/Sites";
import {SignupState, signupState} from "@model/signup";
import MapScene from "@ui/map/MapScene";

/**
 * Never statically rendered: this page both records a landing event and reads
 * the live pilot count for the capacity gate. Cached, it would report one
 * visitor for all time and go stale the moment a pilot signs up.
 */
export const dynamic = 'force-dynamic';

type SearchParams = { full?: string };

function SpotsRemaining({state}: { state: SignupState }) {
    if (!state.isOpen) {
        return <div className={`${styles.alert} ${styles.alertWarning}`}>
            <strong>All {state.capacity} spots are taken.</strong>
            <p style={{margin: 'var(--space-2) 0 0 0'}}>
                {BRAND_NAME} is in early access and Strava caps how many athletes can connect to
                it. Check back once the cap is raised.
            </p>
        </div>
    }

    return <p className={styles.description} style={{marginBottom: 'var(--space-4)'}}>
        Early access &mdash; <strong>{state.spotsRemaining} of {state.capacity}</strong> spots left.
    </p>
}

export default async function Home({searchParams}: { searchParams: Promise<SearchParams> }) {
    const headersList = await headers();

    // Both are awaited before render. The landing insert is a few milliseconds
    // against a warm pool, and doing it inline is more reliable on Cloud Run
    // than deferring it past the response, where CPU is throttled.
    const [, pilotCount, heroBounds] = await Promise.all([
        recordEvent('landing', '/', headersList),
        getCount().catch(error => {
            // Fail open, matching /connect: a database blip should not make the
            // site look closed. Strava still enforces the real cap.
            console.error('home: pilot count failed, showing signup anyway:', error);
            return 0;
        }),
        Sites.getBusiestBounds(),
    ]);

    const state = signupState(pilotCount);
    // Set when /connect turned someone away, so the explanation lands on the
    // page they arrive at rather than being silently swallowed by the redirect.
    const wasTurnedAway = (await searchParams).full !== undefined;

    return (
        <>
            {/*
              * Nothing to select and nothing to frame, so the map is scenery
              * here: a translucent panel over a slowly turning view of the Alps.
              * The drift stops for good the moment anyone touches the map.
              */}
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>
        <div className={styles.pageCentered}>

            <h1 className={styles.title}>
                Welcome to {BRAND_NAME}.
            </h1>

            <h2 className={styles.subtitle}>
                Your paragliding flights, tracked from Strava.
            </h2>

            <p className={styles.description}>
                Connect your Strava account and {BRAND_NAME} finds your flights, works out where you
                took off and landed, and writes the stats straight back onto your activity.
            </p>

            {wasTurnedAway && !state.isOpen && (
                <div className={`${styles.alert} ${styles.alertWarning}`}>
                    Someone took the last spot before you got there. Sorry.
                </div>
            )}

            <SpotsRemaining state={state}/>

            {state.isOpen && (
                <div style={{marginBottom: 'var(--space-6)'}}>
                    <ConnectWithStrava/>
                </div>
            )}

            <div className={styles.loginFeatures}>
                <h3 style={{
                    marginBottom: 'var(--space-3)',
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 'var(--font-weight-semibold)'
                }}>
                    What you'll get:
                </h3>
                <ul style={{
                    margin: 0,
                    paddingLeft: 'var(--space-4)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)'
                }}>
                    <li style={{marginBottom: 'var(--space-1)'}}>Automatic flight detection</li>
                    <li style={{marginBottom: 'var(--space-1)'}}>Takeoff and landing site identification</li>
                    <li style={{marginBottom: 'var(--space-1)'}}>Wind conditions at the time you flew</li>
                    <li>Flight stats written back to your Strava description</li>
                </ul>
            </div>

        </div>
        </>
    );
}
