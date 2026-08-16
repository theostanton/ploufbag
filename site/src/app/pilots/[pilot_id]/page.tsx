import {notFound} from "next/navigation";
import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import {getPilotWingStats} from "@database/stats";
import {Sites} from "@database/Sites";
import {Metadata, ResolvingMetadata} from "next";
import {createMetadata} from "@ui/metadata";
import Link from "next/link";
import SignupBanner from "@ui/SignupBanner";
import MapScene from "@ui/map/MapScene";
import FlightRow from "@ui/chrome/FlightRow";
import {PanelFacts, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import styles from "@ui/chrome/PilotDetail.module.css";
import {formatSiteName} from "@utils/formatSiteName";

type Params = { pilot_id: string };

export async function generateMetadata(
    {params}: { params: Promise<Params> },
    parent: ResolvingMetadata
): Promise<Metadata> {
    const pilotId = parseInt((await params).pilot_id)
    const [pilot, pilotErrorMessage] = await get(pilotId);
    if (pilotErrorMessage) {
        return createMetadata()
    }
    return createMetadata(pilot.first_name)
}

/**
 * One pilot: every flight they have logged, framed together.
 *
 * The scene names the pilot's flights rather than supplying geometry. The map
 * already holds every track, so "this pilot" is an emphasis over the shared
 * collection — which is also why the surrounding flying stays visible, dimmed,
 * instead of the pilot's tracks floating alone.
 *
 * Flights.getAllForPilotWithPolylines is gone with PilotMap. The full list is
 * still needed to tell the map which tracks are this pilot's, but only their
 * ids are, so it comes from the same summary query the panel lists.
 */
export default async function PilotPage({params}: {
    params: Promise<Params>
}) {
    const pilotId = parseInt((await params).pilot_id)

    const [
        [pilot, pilotErrorMessage],
        [wingStats],
        [stats],
        [allFlights],
        [totalFlightCount],
    ] = await Promise.all([
        get(pilotId),
        getPilotWingStats(pilotId),
        Sites.getPilotStats(pilotId),
        Flights.getForPilot(pilotId),
        Flights.getPilotFlightCount(pilotId),
    ]);

    if (!pilot) {
        notFound();
    }

    const flights = allFlights ?? [];
    const takeoffs = stats?.takeoffs.filter(item => item.site) ?? [];
    const landings = stats?.landings.filter(item => item.site) ?? [];
    const wings = wingStats?.wingStats ?? [];

    return (
        <>
            <MapScene
                chrome="sheet"
                emphasis={{
                    flights: flights.map(flight => String(flight.strava_activity_id)),
                    dimOthers: true,
                }}
            />

            <PanelHeader
                back={{href: '/pilots', label: 'All pilots'}}
                title={pilot.first_name}
                subtitle={`${totalFlightCount ?? flights.length} flights`}
            />

            <SignupBanner from="pilot"/>

            <PanelSection>
                <PanelFacts
                    facts={[
                        {label: 'Flights', value: totalFlightCount ?? flights.length},
                        {label: 'Wings', value: wings.length},
                        {label: 'Takeoffs', value: takeoffs.length},
                        {label: 'Landings', value: landings.length},
                    ]}
                />
            </PanelSection>

            {wings.length > 0 && (
                <PanelSection title="Wings">
                    <ul className={styles.tally}>
                        {wings.map(item => (
                            <li key={item.wing}>
                                <Link
                                    href={`/pilots/${pilotId}/${encodeURIComponent(item.wing.toLowerCase())}`}
                                    className={styles.tallyRow}
                                >
                                    <span className={styles.tallyName}>{item.wing}</span>
                                    <span className={styles.tallyCount}>{item.flights}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </PanelSection>
            )}

            {takeoffs.length > 0 && (
                <PanelSection title="Takeoffs">
                    <ul className={styles.tally}>
                        {takeoffs.slice(0, 8).map(item => (
                            <li key={item.site.ffvl_sid}>
                                <Link href={`/sites/${item.site.slug}`} className={styles.tallyRow}>
                                    <span className={styles.tallyName}>
                                        {formatSiteName(item.site.name)}
                                    </span>
                                    <span className={styles.tallyCount}>{item.flights}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </PanelSection>
            )}

            {landings.length > 0 && (
                <PanelSection title="Landings">
                    <ul className={styles.tally}>
                        {landings.slice(0, 8).map(item => (
                            <li key={item.site.ffvl_sid}>
                                <Link href={`/sites/${item.site.slug}`} className={styles.tallyRow}>
                                    <span className={styles.tallyName}>
                                        {formatSiteName(item.site.name)}
                                    </span>
                                    <span className={styles.tallyCount}>{item.flights}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </PanelSection>
            )}

            {flights.length > 0 && (
                <PanelSection title="Flights">
                    {flights.map(flight => (
                        <FlightRow key={flight.strava_activity_id} flight={flight}/>
                    ))}
                </PanelSection>
            )}
        </>
    );
}
