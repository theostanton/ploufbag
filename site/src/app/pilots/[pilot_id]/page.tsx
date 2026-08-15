import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import {getPilotWingStats} from "@database/stats";
import styles from "@styles/Page.module.css";
import detailStyles from "@ui/DetailPages.module.css";
import {Metadata, ResolvingMetadata} from "next";
import {createMetadata} from "@ui/metadata";
import FlightItem from "@ui/FlightItem";
import Link from "next/link";
import {Sites} from "@database/Sites";
import PilotMap from "@ui/PilotMap";
import SignupBanner from "@ui/SignupBanner";
import mapStyles from "@ui/FlightMap.module.css";
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


export default async function PagePilot({params}: {
    params: Promise<Params>
}) {
    const pilotId = parseInt((await params).pilot_id)

    // Run all database calls in parallel to reduce connection time
    const [
        [pilot, pilotErrorMessage],
        [wingStats, wingStatsErrorMessage],
        [stats, takeoffStatsErrorMessage],
        [flights, flightsErrorMessage],
        [totalFlightCount, flightCountErrorMessage],
        [allFlights, allFlightsErrorMessage]
    ] = await Promise.all([
        get(pilotId),
        getPilotWingStats(pilotId),
        Sites.getPilotStats(pilotId),
        Flights.getForPilot(pilotId, 5),
        Flights.getPilotFlightCount(pilotId),
        Flights.getAllForPilotWithPolylines(pilotId)
    ]);

    if (pilotErrorMessage) {
        return <h1>pilotErrorMessage={pilotErrorMessage}</h1>
    }
    if (wingStatsErrorMessage) {
        return <h1>wingStatsErrorMessage={wingStatsErrorMessage}</h1>
    }
    if (takeoffStatsErrorMessage) {
        return <h1>takeoffStatsErrorMessage={takeoffStatsErrorMessage}</h1>
    }
    if (flightsErrorMessage) {
        return <h1>flightsErrorMessage={flightsErrorMessage}</h1>
    }
    if (flightCountErrorMessage) {
        return <h1>flightCountErrorMessage={flightCountErrorMessage}</h1>
    }
    if (allFlightsErrorMessage) {
        return <h1>allFlightsErrorMessage={allFlightsErrorMessage}</h1>
    }

    const totalFlights = totalFlightCount;
    const totalWings = wingStats.wingStats.length;
    const totalTakeoffs = stats.takeoffs.filter(item => item.site).length;
    const totalLandings = stats.landings.filter(item => item.site).length;

    return <div className={styles.page}>
        <div className={styles.container}>
            <SignupBanner from="pilot"/>
            {/* Header Section */}
            <header className={styles.pageHeaderWithProfile}>
                {pilot.profile_image_url && (
                    <img
                        src={pilot.profile_image_url}
                        alt={pilot.first_name}
                        className={styles.profileImage}
                    />
                )}
                <div>
                    <h1 className={styles.title}>{pilot.first_name}</h1>
                </div>
            </header>

            {/* Pilot Statistics Grid */}
            <div className={detailStyles.grid}>
                {/* Overview Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Pilot Overview</h3>
                    <div className={detailStyles.infoGrid}>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Total Flights</span>
                            <span className={detailStyles.infoValue}>{totalFlights}</span>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Wings Used</span>
                            <span className={detailStyles.infoValue}>{totalWings}</span>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Takeoff Sites</span>
                            <span className={detailStyles.infoValue}>{totalTakeoffs}</span>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Landing Sites</span>
                            <span className={detailStyles.infoValue}>{totalLandings}</span>
                        </div>
                    </div>
                </div>

                {/* Wings Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Wings</h3>
                    <div className={detailStyles.statsList}>
                        {wingStats.wingStats.slice(0, 5).map(item => (
                            <Link
                                key={item.wing}
                                href={`/pilots/${pilotId}/${encodeURIComponent(item.wing.toLowerCase())}`}
                                className={detailStyles.statsItem}
                            >
                                <span className={detailStyles.statsItemName}>{item.wing}</span>
                                <span className={detailStyles.statsItemCount}>{item.flights} flights</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Takeoffs Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Favorite Takeoffs</h3>
                    <div className={detailStyles.statsList}>
                        {stats.takeoffs
                            .filter(item => item.site)
                            .slice(0, 5)
                            .map(item => (
                                <Link
                                    key={item.site.slug}
                                    href={`/sites/${item.site.slug}`}
                                    className={detailStyles.statsItem}
                                >
                                    <span className={detailStyles.statsItemName}>{formatSiteName(item.site.name)}</span>
                                    <span className={detailStyles.statsItemCount}>{item.flights} flights</span>
                                </Link>
                            ))}
                    </div>
                </div>

                {/* Landings Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Favorite Landings</h3>
                    <div className={detailStyles.statsList}>
                        {stats.landings
                            .filter(item => item.site)
                            .slice(0, 5)
                            .map(item => (
                                <Link
                                    key={item.site.slug}
                                    href={`/sites/${item.site.slug}`}
                                    className={detailStyles.statsItem}
                                >
                                    <span className={detailStyles.statsItemName}>{formatSiteName(item.site.name)}</span>
                                    <span className={detailStyles.statsItemCount}>{item.flights} flights</span>
                                </Link>
                            ))}
                    </div>
                </div>
            </div>

            {/* Pilot Activity Map Section */}
            <div className={detailStyles.infoCard}>
                <h3 className={detailStyles.infoTitle}>Flying Activity Map</h3>
                <PilotMap
                    flights={allFlights || []}
                    pilotName={pilot.first_name}
                    className={mapStyles.mapContainer}
                />
            </div>

            {/* Recent Flights Section */}
            <div className={detailStyles.infoCard}>
                <h3 className={detailStyles.infoTitle}>Recent Flights</h3>
                <div className={detailStyles.flightsList}>
                    {flights.map(flight => (
                        <FlightItem key={flight.strava_activity_id} flight={flight}/>
                    ))}
                </div>
            </div>
        </div>
    </div>
}