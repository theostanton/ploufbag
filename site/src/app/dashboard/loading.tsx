import styles from "@ui/chrome/Skeleton.module.css";

/**
 * A skeleton for the dashboard panel.
 *
 * Deliberately scoped to this one segment rather than sitting at the root.
 *
 * A loading.tsx lets Next flush the shell before the page has finished, which
 * is what makes the panel stream while the map stays live — but it also commits
 * the HTTP status at flush time, so a later notFound() can no longer set 404.
 * With one at the root, /nonexistentpath and every missing flight returned 200
 * with not-found content: a soft 404, and the flight pages are exactly the ones
 * crawlers reach from Strava descriptions.
 *
 * The dashboard is the right place for the trade: it never calls notFound(), it
 * is behind auth so nothing crawls it, and it fans out six parallel queries —
 * the slowest panel in the app.
 */
export default function DashboardLoading() {
    return (
        <div className={styles.skeleton} role="status" aria-label="Loading your dashboard">
            <div className={`${styles.bar} ${styles.title}`}/>
            <div className={`${styles.bar} ${styles.subtitle}`}/>
            <div className={styles.rows}>
                {Array.from({length: 5}).map((_, index) => (
                    <div key={index} className={styles.row}>
                        <div className={styles.swatch}/>
                        <div className={styles.rowBody}>
                            <div className={`${styles.bar} ${styles.rowTitle}`}/>
                            <div className={`${styles.bar} ${styles.rowMeta}`}/>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
