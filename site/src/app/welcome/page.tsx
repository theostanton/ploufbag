import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import {Sites} from "@database/Sites";
import {Metadata} from "next";
import Link from "next/link";
import {createMetadata} from "@ui/metadata";
import {BRAND_NAME} from "@ui/brand";
import MapScene from "@ui/map/MapScene";
import {PanelEmpty, PanelHeader} from "@ui/chrome/Panel";
import Onboarding from "@ui/onboarding/Onboarding";
import {getOnboardingState} from "@actions/onboarding";
import styles from "./Welcome.module.css";

export const metadata: Metadata = createMetadata('Welcome')

/**
 * Read live and changing under the pilot as the first scan lands.
 */
export const dynamic = 'force-dynamic';

/**
 * Where Strava's OAuth callback lands a pilot the moment they connect.
 *
 * It used to promise that "there is nothing else to set up", which was not true:
 * an activity only became a flight if the pilot had hand-typed a 🪂 line into its
 * Strava description, and everything without one was discarded into a log nobody
 * read. The page asked for nothing because there was nothing it could do with an
 * answer.
 *
 * Now it shows what we already found -- the payoff, before any paperwork -- and
 * then asks the one question that is actually worth asking. A pilot with a single
 * wing is completely set up in two taps.
 */
export default async function Welcome() {
    const selfId = await Auth.getSelfPilotId()

    const [[pilot, error], state, heroBounds] = await Promise.all([
        get(selfId),
        getOnboardingState(),
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

    return (
        <>
            {/*
              * Their own flying, framed behind the panel. Ambient until there is
              * something of theirs to show, which is most of the first few
              * seconds.
              */}
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>

            <div className={styles.column}>
                <Onboarding initial={state} firstName={pilot.first_name}/>
            </div>
        </>
    );
}
