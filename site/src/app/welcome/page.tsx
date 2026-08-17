import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import {Sites} from "@database/Sites";
import {Metadata} from "next";
import Link from "next/link";
import {createMetadata} from "@ui/metadata";
import {BRAND_NAME} from "@ui/brand";
import MapScene from "@ui/map/MapScene";
import {PanelEmpty, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import pitch from "@ui/chrome/Pitch.module.css";
import styles from "./Welcome.module.css";

export const metadata: Metadata = createMetadata('Welcome')

/**
 * The pilot count and the flight count are both read live and both change the
 * page, so this must never be cached.
 */
export const dynamic = 'force-dynamic';

/**
 * Where Strava's OAuth callback lands a pilot the moment they connect — see
 * functions/src/webhooks/handleCode.ts, which redirects here.
 *
 * It used to be a single `<h1>` and nothing else: the most important moment in
 * the product, and the answer to "what happens now?" was a dead end. It now
 * says what is happening, shows the flights already found, and offers the two
 * places worth going next.
 *
 * The sync is asynchronous — handleCode queues fetchAllActivities — so the
 * count here is whatever has landed by the time the redirect completes, which
 * is usually zero. The copy is written for that case rather than treating it as
 * an error.
 */
export default async function Welcome() {
    const selfId = await Auth.getSelfPilotId()

    const [[pilot, error], [flightCount], heroBounds] = await Promise.all([
        get(selfId),
        Flights.getPilotFlightCount(selfId),
        Sites.getBusiestBounds(),
    ])

    if (error || !pilot) {
        return (
            <>
                <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>
                <PanelHeader title={`Welcome to ${BRAND_NAME}`}/>
                <PanelEmpty
                    title="You are connected, but we could not load your profile"
                    detail={
                        <>
                            {error} — <Link href="/dashboard">try your dashboard</Link>.
                        </>
                    }
                />
            </>
        )
    }

    const found = flightCount ?? 0

    return (
        <>
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>

            <div className={styles.column}>
                <PanelHeader
                    title={`You're in, ${pilot.first_name}.`}
                    subtitle={`${BRAND_NAME} is reading your Strava account now. Paragliding activities become flights automatically — there is nothing else to set up.`}
                />

                <PanelSection>
                    <p className={styles.found}>
                        <strong className={styles.foundValue}>{found}</strong>
                        <span className={styles.foundLabel}>
                            {found === 0
                                ? 'flights so far — the first sync is still running, so check back in a few minutes.'
                                : found === 1
                                    ? 'flight found already.'
                                    : 'flights found already.'}
                        </span>
                    </p>
                </PanelSection>

                <PanelSection title="What happens from here">
                    <ol className={pitch.steps}>
                        <li className={pitch.step}>
                            <span className={pitch.stepNumber} aria-hidden="true">1</span>
                            <span className={pitch.stepBody}>
                                <strong className={pitch.stepTitle}>We match every flight to a site</strong>
                                <span className={pitch.stepText}>
                                    Takeoff and landing are worked out from the track, along with the
                                    wind at the time you flew.
                                </span>
                            </span>
                        </li>
                        <li className={pitch.step}>
                            <span className={pitch.stepNumber} aria-hidden="true">2</span>
                            <span className={pitch.stepBody}>
                                <strong className={pitch.stepTitle}>Your stats go back to Strava</strong>
                                <span className={pitch.stepText}>
                                    They are written onto the activity description. Choose what goes in
                                    that description from your dashboard.
                                </span>
                            </span>
                        </li>
                        <li className={pitch.step}>
                            <span className={pitch.stepNumber} aria-hidden="true">3</span>
                            <span className={pitch.stepBody}>
                                <strong className={pitch.stepTitle}>New flights arrive on their own</strong>
                                <span className={pitch.stepText}>
                                    Strava tells us when you upload one. You will not need to come back
                                    and sync anything.
                                </span>
                            </span>
                        </li>
                    </ol>

                    <div className={styles.actions}>
                        <Link href="/dashboard" className={styles.primary}>
                            Go to your dashboard
                        </Link>
                        <Link href="/flights" className={styles.secondary}>
                            Explore the map
                        </Link>
                    </div>
                </PanelSection>
            </div>
        </>
    );
}
