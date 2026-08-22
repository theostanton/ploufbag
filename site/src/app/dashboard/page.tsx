import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import {getPilotWingStats} from "@database/stats";
import {Sites} from "@database/Sites";
import {DescriptionPreferences} from "@database/descriptionPreferences";
import {Activities, Flights as FlightsCommon, Wings, isSuccess} from "@ploufbag/common";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import Link from "next/link";
import DescriptionPreferencesComponent from "@ui/preferences/DescriptionPreferences";
import WingsManager from "@ui/wings/WingsManager";
import MapScene from "@ui/map/MapScene";
import FlightRow from "@ui/chrome/FlightRow";
import {PanelEmpty, PanelFacts, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import tally from "@ui/chrome/PilotDetail.module.css";
import {formatSiteName} from "@utils/formatSiteName";

export const metadata: Metadata = createMetadata('Dashboard')

/**
 * The signed-in pilot's own view.
 *
 * Rebuilt on the panel primitives. It was still wearing the document-era card
 * grid — four `infoCard`s side by side, sized for a 1200px page — inside a
 * centred glass panel, which made it the one route that looked like a different
 * product.
 *
 * Glass rather than a rail, and framed on this pilot's own flying: the map
 * behind your dashboard should be your map. It is not a map *view* though —
 * there is a form on it — so the panel stays centred and the camera does not
 * expect to be steered.
 */
export default async function Dashboard() {
    const pilotId = await Auth.getSelfPilotId();

    const [
        [pilot, pilotErrorMessage],
        [wingStats],
        [stats],
        [recentFlights],
        [totalFlightCount],
        descriptionPreferencesResult,
        [ownFlights],
        [wingRecords],
        verdictCountsResult,
        unattributedResult
    ] = await Promise.all([
        get(pilotId),
        getPilotWingStats(pilotId),
        Sites.getPilotStats(pilotId),
        Flights.getForPilot(pilotId, 5),
        Flights.getPilotFlightCount(pilotId),
        DescriptionPreferences.get(pilotId),
        // Ids only, to tell the map which tracks are yours.
        Flights.getForPilot(pilotId),
        Wings.getForPilotWithCounts(pilotId),
        Activities.countsForPilot(pilotId),
        FlightsCommon.countUnattributed(pilotId)
    ]);

    if (!pilot) {
        return (
            <>
                <MapScene chrome="glass"/>
                <PanelHeader title="Dashboard"/>
                <PanelEmpty
                    title="We could not load your dashboard"
                    detail={pilotErrorMessage}
                />
            </>
        );
    }

    const flights = recentFlights ?? [];
    const wings = wingStats?.wingStats ?? [];
    const takeoffs = stats?.takeoffs.filter(item => item.site) ?? [];
    const landings = stats?.landings.filter(item => item.site) ?? [];

    const waiting = isSuccess(verdictCountsResult) ? verdictCountsResult[0].unsure : 0;
    const unattributed = isSuccess(unattributedResult) ? unattributedResult[0] : 0;

    const preferences = isSuccess(descriptionPreferencesResult) ? descriptionPreferencesResult[0] : {
        pilot_id: pilotId,
        include_sites: true,
        include_wind: true,
        include_wing_aggregate: true,
        include_year_aggregate: true,
        include_all_time_aggregate: true
    };

    const sampleFlight = flights.length > 0 ? {
        wing: flights[0].wing,
        start_date: flights[0].start_date,
        takeoff_name: flights[0].takeoff?.name || 'Unknown Takeoff',
        landing_name: flights[0].landing?.name || 'Unknown Landing',
        pilot_id: pilotId,
        strava_activity_id: flights[0].strava_activity_id,
        duration_sec: flights[0].duration_sec,
        distance_meters: flights[0].distance_meters,
        description: flights[0].description,
        // The preview formatter renders text from the flight's statistics and
        // never looks at its geometry; the field exists only to satisfy the
        // FlightRow shape it takes. The list query no longer fetches polylines.
        polyline: [],
        landing_id: flights[0].landing?.ffvl_sid,
        takeoff_id: flights[0].takeoff?.ffvl_sid
    } : null;

    return (
        <>
            <MapScene
                chrome="glass"
                emphasis={{
                    flights: (ownFlights ?? []).map(flight => String(flight.strava_activity_id)),
                    dimOthers: true,
                }}
            />

            <PanelHeader
                title={`Welcome back, ${pilot.first_name}`}
                subtitle="Everywhere you have flown is on the map behind this."
            />

            <PanelSection>
                <PanelFacts
                    facts={[
                        {
                            label: 'Flights',
                            value: <Link href={`/pilots/${pilotId}`}>{totalFlightCount ?? flights.length}</Link>,
                        },
                        {label: 'Wings', value: (wingRecords ?? []).length || wings.length},
                        {label: 'Takeoffs', value: takeoffs.length},
                        {label: 'Landings', value: landings.length},
                    ]}
                />
            </PanelSection>

            <PanelSection title="Your Strava descriptions">
                <DescriptionPreferencesComponent
                    initialPreferences={preferences}
                    sampleFlight={sampleFlight}
                />
            </PanelSection>

            {/*
              * Two nudges, both optional and both dismissible by simply not
              * doing them. Neither is an error state: an activity we could not
              * call and a flight without a wing are ordinary, permanent,
              * legal things, and the design is explicit that this pile must
              * never become an obligation.
              */}
            {(waiting > 0 || unattributed > 0) && (
                <PanelSection title="When you have a minute">
                    <ul className={tally.tally}>
                        {waiting > 0 && (
                            <li>
                                <Link href="/activities" className={tally.tallyRow}>
                                    <span className={tally.tallyName}>
                                        {waiting === 1
                                            ? 'One activity we could not call'
                                            : `${waiting} activities we could not call`}
                                    </span>
                                    <span className={tally.tallyCount}>Review</span>
                                </Link>
                            </li>
                        )}
                        {unattributed > 0 && (
                            <li>
                                <Link href="/activities" className={tally.tallyRow}>
                                    <span className={tally.tallyName}>
                                        {unattributed === 1
                                            ? 'One flight with no wing on it'
                                            : `${unattributed} flights with no wing on them`}
                                    </span>
                                    <span className={tally.tallyCount}>Set</span>
                                </Link>
                            </li>
                        )}
                    </ul>
                </PanelSection>
            )}

            {/*
              * Editable, where this was a read-only tally of names parsed out of
              * Strava descriptions. Rendered whether or not there are any wings:
              * a pilot with none needs the way in more than anyone.
              */}
            <PanelSection title="Your wings">
                <WingsManager wings={wingRecords ?? []}/>
            </PanelSection>

            {takeoffs.length > 0 && (
                <PanelSection title="Your takeoffs">
                    <ul className={tally.tally}>
                        {takeoffs.slice(0, 8).map(item => (
                            <li key={item.site.ffvl_sid}>
                                <Link href={`/sites/${item.site.slug}`} className={tally.tallyRow}>
                                    <span className={tally.tallyName}>
                                        {formatSiteName(item.site.name)}
                                    </span>
                                    <span className={tally.tallyCount}>{item.flights}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </PanelSection>
            )}

            <PanelSection
                title="Recent flights"
                action={<Link href={`/pilots/${pilotId}`}>See all</Link>}
            >
                {flights.length > 0 ? (
                    flights.map(flight => (
                        <FlightRow key={flight.strava_activity_id} flight={flight}/>
                    ))
                ) : (
                    <PanelEmpty
                        title="No flights yet"
                        detail={
                            <>
                                Once Strava has a paragliding activity for you, it will appear here
                                and on the map. <Link href="/sites">Find somewhere to fly.</Link>
                            </>
                        }
                    />
                )}
            </PanelSection>
        </>
    );
}
