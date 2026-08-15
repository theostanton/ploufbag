import {Flights} from "@database/flights";
import styles from "@styles/Page.module.css";
import detailStyles from "@ui/DetailPages.module.css";
import {Stat} from "@ui/stats/model";
import {StravaActivityId} from "@ploufbag/common";
import Stats from "@ui/stats/Stats";
import ViewOnStrava from "@ui/links/ViewOnStrava";
import ClientOnlyDate from "@ui/ClientOnlyDate";
import Link from "next/link";
import FlightMap from "@ui/FlightMap";
import mapStyles from "@ui/FlightMap.module.css";
import {formatSiteName} from "@utils/formatSiteName";


export default async function FlightDetail({params}: {
    params: Promise<{ flight_id: StravaActivityId }>
}) {
    const flightId = (await params).flight_id;
    const [flight, errorMessage] = await Flights.get(flightId);

    if (!flight) {
        return <div className={styles.page}>
            <div className={styles.container}>
                <h1>{errorMessage}</h1>
            </div>
        </div>;
    }

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}min`;
    };

    const formatDistance = (meters: number) => {
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatAltitude = (alt: number) => {
        return `${alt}m`;
    };

    const stats: Stat[] = [
        {label: "Duration", value: formatDuration(flight.duration_sec)},
        {label: "Distance", value: formatDistance(flight.distance_meters)},
    ];

    return <div className={styles.page}>
        <div className={styles.container}>
            {/* Header Section */}
            <header className={styles.pageHeader}>
                <h1 className={styles.title}>
                    {flight.wing} {flight.pilot && `by ${flight.pilot.first_name}`}
                </h1>
                <p className={styles.description}>
                    <ClientOnlyDate date={flight.start_date} format="full"/>
                </p>
            </header>

            {/* Stats Section */}
            <div className={styles.section}>
                <Stats stats={stats}/>
            </div>

            {/* Flight Information Grid */}
            <div className={detailStyles.grid}>
                {/* Flight Details Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Flight Details</h3>
                    <div className={detailStyles.infoGrid}>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Wing</span>
                            <Link href={`/pilots/${flight.pilot_id}/${encodeURIComponent(flight.wing.toLowerCase())}`}
                                  className={detailStyles.infoValue}
                                  style={{textDecoration: 'none', color: 'var(--color-primary)', cursor: 'pointer'}}>
                                {flight.wing}
                            </Link>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Duration</span>
                            <span className={detailStyles.infoValue}>{formatDuration(flight.duration_sec)}</span>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Distance</span>
                            <span className={detailStyles.infoValue}>{formatDistance(flight.distance_meters)}</span>
                        </div>
                        <div className={detailStyles.infoItem}>
                            <span className={detailStyles.infoLabel}>Start Time</span>
                            <span className={detailStyles.infoValue}>
                                <ClientOnlyDate date={flight.start_date} format="time"/>
                            </span>
                        </div>
                        {flight.pilot && (
                            <div className={detailStyles.infoItem}>
                                <span className={detailStyles.infoLabel}>Pilot</span>
                                <Link href={`/pilots/${flight.pilot.pilot_id}`} style={{
                                    textDecoration: 'none',
                                    color: 'var(--color-primary)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                }}>
                                    {flight.pilot.first_name}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sites Information Card */}
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Flight Path</h3>
                    <div className={detailStyles.siteGrid}>
                        {flight.takeoff?.slug ? (
                            <Link href={`/sites/${flight.takeoff.slug}`} className={detailStyles.site}>
                                <div className={detailStyles.siteIcon}>↗️</div>
                                <div className={detailStyles.siteLabel}>Takeoff</div>
                                <div className={detailStyles.siteName}>
                                    {formatSiteName(flight.takeoff.name)}
                                </div>
                                {flight.takeoff.alt && (
                                    <div className={detailStyles.siteAlt}>
                                        {formatAltitude(flight.takeoff.alt)}
                                    </div>
                                )}
                            </Link>
                        ) : (
                            <div className={detailStyles.site}>
                                <div className={detailStyles.siteIcon}>↗️</div>
                                <div className={detailStyles.siteLabel}>Takeoff</div>
                                <div className={detailStyles.siteName}>Unknown</div>
                            </div>
                        )}
                        <div className={detailStyles.arrow}>→</div>
                        {flight.landing?.slug ? (
                            <Link href={`/sites/${flight.landing.slug}`} className={detailStyles.site}>
                                <div className={detailStyles.siteIcon}>↘️</div>
                                <div className={detailStyles.siteLabel}>Landing</div>
                                <div className={detailStyles.siteName}>
                                    {formatSiteName(flight.landing.name)}
                                </div>
                                {flight.landing.alt && (
                                    <div className={detailStyles.siteAlt}>
                                        {formatAltitude(flight.landing.alt)}
                                    </div>
                                )}
                            </Link>
                        ) : (
                            <div className={detailStyles.site}>
                                <div className={detailStyles.siteIcon}>↘️</div>
                                <div className={detailStyles.siteLabel}>Landing</div>
                                <div className={detailStyles.siteName}>Unknown</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Flight Map Section */}
            <div className={detailStyles.infoCard}>
                <h3 className={detailStyles.infoTitle}>Flight Map</h3>
                <FlightMap
                    polyline={flight.polyline}
                    takeoffSite={flight.takeoff ? {
                        name: formatSiteName(flight.takeoff.name),
                        lat: flight.takeoff.lat,
                        lng: flight.takeoff.lng
                    } : null}
                    landingSite={flight.landing ? {
                        name: formatSiteName(flight.landing.name),
                        lat: flight.landing.lat,
                        lng: flight.landing.lng
                    } : null}
                    className={mapStyles.mapContainer}
                />
            </div>

            {/* Description Section */}
            {flight.description && (
                <div className={detailStyles.infoCard}>
                    <h3 className={detailStyles.infoTitle}>Flight Description</h3>
                    <div style={{
                        whiteSpace: 'pre-wrap',
                        marginBottom: 'var(--space-4)',
                        lineHeight: 'var(--line-height-relaxed)'
                    }}>
                        {flight.description}
                    </div>
                    <div className={detailStyles.linksContainer}>
                        <ViewOnStrava flightId={flight.strava_activity_id}/>
                    </div>
                </div>
            )}
        </div>
    </div>;
}