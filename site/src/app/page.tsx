import {headers} from "next/headers";
import {recordEvent} from "@database/analytics";
import {getCount} from "@database/pilots";
import {Sites} from "@database/Sites";
import {signupState} from "@model/signup";
import {BRAND_NAME} from "@ui/brand";
import MapScene from "@ui/map/MapScene";
import Pitch from "@ui/chrome/Pitch";
import styles from "@ui/chrome/Pitch.module.css";

/**
 * Never statically rendered: this page both records a landing event and reads
 * the live pilot count for the capacity gate. Cached, it would report one
 * visitor for all time and go stale the moment a pilot signs up.
 */
export const dynamic = 'force-dynamic';

type SearchParams = { full?: string };

export default async function Home({searchParams}: { searchParams: Promise<SearchParams> }) {
    const headersList = await headers();

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
              * here: a translucent panel over a slowly turning view of wherever
              * the community flies most. The drift stops for good the moment
              * anyone touches the map.
              */}
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>
            <Pitch
                state={state}
                notice={wasTurnedAway && (
                    <div className={styles.full}>
                        <strong>Early access is full right now.</strong>
                        <p>
                            Strava caps how many athletes can connect to {BRAND_NAME}, and we are at
                            the cap. Nothing went wrong on your end.
                        </p>
                    </div>
                )}
            />
        </>
    );
}
