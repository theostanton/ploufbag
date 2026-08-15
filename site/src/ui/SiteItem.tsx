import {Site} from "@ploufbag/common";
import Link from "next/link";
import styles from "./SiteItem.module.css";
import {formatSiteName} from "../utils/formatSiteName";

type SiteWithFlightCount = Site & {flightCount?: number};

export default function SiteItem({site}: { site: SiteWithFlightCount }) {
    const formatCoordinate = (coord: number) => coord.toFixed(6);
    const formatAltitude = (alt: number) => `${alt}m`;

    return (
        <div className={styles.container}>
            <Link href={`/sites/${site.slug}`} className={styles.mainContent}>
                <div className={styles.header}>
                    <div className={styles.siteInfo}>
                        <div className={styles.siteName}>🏔️ {formatSiteName(site.name)}</div>
                        <div className={styles.siteId}>ID: {site.ffvl_sid}</div>
                    </div>
                    <div className={styles.metrics}>
                        <div className={styles.metric}>
                            <span className={styles.metricValue}>{formatAltitude(site.alt)}</span>
                            <span className={styles.metricLabel}>Altitude</span>
                        </div>
                        {site.flightCount !== undefined && (
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{site.flightCount}</span>
                                <span className={styles.metricLabel}>Flights</span>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className={styles.location}>
                    <div className={styles.locationIcon}>📍</div>
                    <div className={styles.coordinates}>
                        <div className={styles.coordinateRow}>
                            <span className={styles.coordinateLabel}>Lat</span>
                            <span className={styles.coordinateValue}>{formatCoordinate(site.lat)}</span>
                        </div>
                        <div className={styles.coordinateRow}>
                            <span className={styles.coordinateLabel}>Lng</span>
                            <span className={styles.coordinateValue}>{formatCoordinate(site.lng)}</span>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}