import { Auth } from "@auth/index";
import { Activities, Wings, isSuccess } from "@ploufbag/common";
import { Flights } from "@database/flights";
import { Metadata } from "next";
import Link from "next/link";
import { createMetadata } from "@ui/metadata";
import MapScene from "@ui/map/MapScene";
import { PanelEmpty, PanelHeader, PanelSection } from "@ui/chrome/Panel";
import ActivitiesPanel, { type FlightWingLink, type PanelWing } from "@ui/activities/ActivitiesPanel";

export const metadata: Metadata = createMetadata('Your activities')

/**
 * Counts and verdicts both change as the pilot works, so this must never be
 * cached.
 */
export const dynamic = 'force-dynamic';

/**
 * Every Strava activity we have looked at, and what we make of it.
 *
 * The permanent home for the decisions the product used to make silently. Before
 * this screen, an activity that failed to import left no trace anywhere a pilot
 * could see -- so "why is my flight missing?" had no answer, and "no, that was
 * my drive home" could not be said at all.
 *
 * Rendered on glass rather than as a map view: there is a working list here with
 * selection and bulk actions, and the camera should not be chasing it around.
 */
export default async function ActivitiesPage() {
    const pilotId = await Auth.getSelfPilotId();

    const [
        activitiesResult,
        countsResult,
        wingsResult,
        [flights],
    ] = await Promise.all([
        Activities.getForPilot(pilotId),
        Activities.countsForPilot(pilotId),
        Wings.getForPilot(pilotId),
        Flights.getForPilot(pilotId),
    ]);

    if (!isSuccess(activitiesResult) || !isSuccess(countsResult)) {
        return (
            <>
                <MapScene chrome="glass"/>
                <PanelHeader title="Your activities"/>
                <PanelEmpty
                    title="We could not load your activities"
                    detail={isSuccess(activitiesResult) ? countsResult[1] : activitiesResult[1]}
                />
            </>
        );
    }

    const activities = activitiesResult[0];
    const counts = countsResult[0];

    const wings: PanelWing[] = (isSuccess(wingsResult) ? wingsResult[0] : []).map(wing => ({
        wing_id: wing.wing_id,
        name: wing.name,
        colour: wing.colour,
        retired: wing.retired,
    }));

    // Which wing each flight is on, so a row can show its chip. Read from the
    // flights table rather than from activities, because the wing lives on the
    // flight -- an activity has no opinion about wings.
    const flightWings: FlightWingLink[] = (flights ?? []).map(flight => ({
        strava_activity_id: String(flight.strava_activity_id),
        wing_id: flight.wing_id ?? null,
        wing: flight.wing ?? null,
        wing_colour: flight.wing_colour ?? null,
    }));

    const nothingScanned = activities.length === 0;

    return (
        <>
            <MapScene chrome="glass"/>

            <PanelHeader
                title="Your activities"
                subtitle="Everything Strava has for you, and what we made of it. Change anything that is wrong."
            />

            <PanelSection>
                {nothingScanned ? (
                    <PanelEmpty
                        title="Nothing scanned yet"
                        detail={
                            <>
                                We read your Strava account when you connected, and again whenever
                                you upload. If you have just signed up, give it a minute and come
                                back — or <Link href="/dashboard">go to your dashboard</Link>.
                            </>
                        }
                    />
                ) : (
                    <ActivitiesPanel
                        activities={activities}
                        counts={counts}
                        wings={wings}
                        flightWings={flightWings}
                    />
                )}
            </PanelSection>
        </>
    );
}
