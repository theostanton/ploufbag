import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import {getPilotWingStats} from "@database/stats";
import {Sites} from "@database/Sites";
import {DescriptionPreferences} from "@database/descriptionPreferences";
import {isSuccess} from "@ploufbag/common";
import styles from "@styles/Page.module.css";
import detailStyles from "@ui/DetailPages.module.css";
import dashboardStyles from "./Dashboard.module.css";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import FlightItem from "@ui/FlightItem";
import DescriptionPreferencesComponent from "@ui/preferences/DescriptionPreferences";
import Link from "next/link";
import {formatSiteName} from "@utils/formatSiteName";

export const metadata: Metadata = createMetadata('Dashboard')

export default async function Dashboard() {
    const pilotId = await Auth.getSelfPilotId();

    // Run all database calls in parallel to reduce connection time
    const [
        [pilot, pilotErrorMessage],
        [wingStats, wingStatsErrorMessage],
        [stats, takeoffStatsErrorMessage],
        [recentFlights, flightsErrorMessage],
        [totalFlightCount, flightCountErrorMessage],
        descriptionPreferencesResult
    ] = await Promise.all([
        get(pilotId),
        getPilotWingStats(pilotId),
        Sites.getPilotStats(pilotId),
        Flights.getForPilot(pilotId, 3),
        Flights.getPilotFlightCount(pilotId),
        DescriptionPreferences.get(pilotId)
    ]);

    // Check for any errors and display them
    const errors = [
        {error: pilotErrorMessage, description: "pilot data"},
        {error: wingStatsErrorMessage, description: "wing statistics"},
        {error: takeoffStatsErrorMessage, description: "site statistics"},
        {error: flightsErrorMessage, description: "recent flights"},
        {error: flightCountErrorMessage, description: "flight count"}
    ].filter(item => item.error);

    if (errors.length > 0) {
        return <div className={styles.page}>
            <div className={styles.container}>
                <h1 className={styles.title}>Dashboard Error</h1>
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Failed to load dashboard data</h3>
                    <div className={dashboardStyles.errorPadding}>
                        {errors.map((item, index) => (
                            <div key={index} className={dashboardStyles.errorItem}>
                                <strong>Error loading {item.description}:</strong> {item.error}
                            </div>
                        ))}
                    </div>
                    <div className={detailStyles.statsList}>
                        <Link href="/login" className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>Try logging in again</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                        <Link href="/" className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>Return to home</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    }

    const totalWings = wingStats.wingStats.length;
    const totalTakeoffs = stats.takeoffs.filter(item => item.site).length;
    const totalLandings = stats.landings.filter(item => item.site).length;

    // Get description preferences (with defaults if not found)
    const preferences = isSuccess(descriptionPreferencesResult) ? descriptionPreferencesResult[0] : {
        pilot_id: pilotId,
        include_sites: true,
        include_wind: true,
        include_wing_aggregate: true,
        include_year_aggregate: true,
        include_all_time_aggregate: true
    };

    // Create sample flight data for preview
    const sampleFlight = recentFlights.length > 0 ? {
        wing: recentFlights[0].wing,
        start_date: recentFlights[0].start_date,
        takeoff_name: recentFlights[0].takeoff?.name || 'Unknown Takeoff',
        landing_name: recentFlights[0].landing?.name || 'Unknown Landing',
        pilot_id: pilotId,
        strava_activity_id: recentFlights[0].strava_activity_id,
        duration_sec: recentFlights[0].duration_sec,
        distance_meters: recentFlights[0].distance_meters,
        description: recentFlights[0].description,
        polyline: recentFlights[0].polyline,
        landing_id: recentFlights[0].landing?.ffvl_sid,
        takeoff_id: recentFlights[0].takeoff?.ffvl_sid
    } : null;

    return <div className={styles.page}>
        <div className={styles.container}>
            {/* Welcome Header */}
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
                    <p className={styles.description}>Your paragliding dashboard</p>
                </div>
            </header>

            {/* Quick Stats Overview */}
            <div className={detailStyles.grid}>
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Your Flying Summary</h3>
                    <div className={detailStyles.infoGrid}>
                        <Link href={`/pilots/${pilotId}`} className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Total Flights</span>
                            <span className={detailStyles.infoValue}>{totalFlightCount}</span>
                        </Link>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Wings Used</span>
                            <span className={detailStyles.infoValue}>{totalWings}</span>
                        </div>
                        <Link href="/sites" className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Takeoff Sites</span>
                            <span className={detailStyles.infoValue}>{totalTakeoffs}</span>
                        </Link>
                        <Link href="/sites" className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Landing Sites</span>
                            <span className={detailStyles.infoValue}>{totalLandings}</span>
                        </Link>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Quick Actions</h3>
                    <div className={detailStyles.statsList}>
                        <Link href={`/pilots/${pilotId}`} className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>View Your Profile</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                        <Link href="/flights" className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>Browse All Flights</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                        <Link href="/sites" className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>Explore Sites</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                        <Link href="/pilots" className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>Community Pilots</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Description Preferences */}
            <DescriptionPreferencesComponent
                initialPreferences={preferences}
                sampleFlight={sampleFlight}
            />

            {/* Your Equipment */}
            {wingStats.wingStats.length > 0 && (
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Your Wings</h3>
                    <div className={detailStyles.statsList}>
                        {wingStats.wingStats.map(item => (
                            <Link
                                key={item.wing}
                                href={`/pilots/${pilotId}/${encodeURIComponent(item.wing.toLowerCase())}`}
                                className={detailStyles.statsItem}
                            >
                                <span className={detailStyles.statsItemName}>🪂 {item.wing}</span>
                                <span className={detailStyles.statsItemCount}>{item.flights} flights</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Your Favorite Sites */}
            {stats.takeoffs.filter(item => item.site).length > 0 && (
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Your Takeoffs</h3>
                    <div className={detailStyles.statsList}>
                        {stats.takeoffs
                            .filter(item => item.site)
                            .map(item => (
                                <Link
                                    key={item.site.slug}
                                    href={`/sites/${item.site.slug}`}
                                    className={detailStyles.statsItem}
                                >
                                    <span
                                        className={detailStyles.statsItemName}>↗️ {formatSiteName(item.site.name)}</span>
                                    <span className={detailStyles.statsItemCount}>{item.flights} flights</span>
                                </Link>
                            ))}
                    </div>
                </div>
            )}

            {/* Recent Flights */}
            {recentFlights.length > 0 && (
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Your Recent Flights</h3>
                    <div className={detailStyles.flightsList}>
                        {recentFlights.map(flight => (
                            <FlightItem key={flight.strava_activity_id} flight={flight}/>
                        ))}
                    </div>
                    <div className={dashboardStyles.flightsSection}>
                        <Link href={`/pilots/${pilotId}`} className={detailStyles.statsItem}>
                            <span className={detailStyles.statsItemName}>View all your flights</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                    </div>
                </div>
            )}

            {/* No flights message */}
            {recentFlights.length === 0 && (
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Your Flights</h3>
                    <div className={dashboardStyles.noFlightsContainer}>
                        <p>No flights recorded yet. Start flying and sync your Strava activities to see them here!</p>
                        <Link href="/sites" className={`${detailStyles.statsItem} ${dashboardStyles.noFlightsAction}`}>
                            <span className={detailStyles.statsItemName}>Explore flying sites</span>
                            <span className={detailStyles.statsItemCount}>→</span>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    </div>
}
