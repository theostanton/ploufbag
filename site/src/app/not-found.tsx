import Link from "next/link";
import styles from "@ui/chrome/ErrorPanel.module.css";

/**
 * An address that resolves to nothing.
 *
 * Reached by notFound() in app/[slug], which is where a mistyped or retired
 * Strava short-link lands — the most likely way anyone arrives here, since those
 * five-character slugs are published in activity descriptions and get copied by
 * hand.
 *
 * It renders inside the sheet like any other view, so the map stays put behind
 * it rather than the whole application disappearing over a bad URL.
 */
export default function NotFound() {
    return (
        <div className={styles.panel}>
            <h1 className={styles.title}>Not found</h1>
            <p className={styles.body}>
                There is nothing at this address. If you followed a link from a
                Strava description, the flight may have been removed.
            </p>
            <div className={styles.actions}>
                <Link href="/flights" className={styles.secondary}>All flights</Link>
                <Link href="/sites" className={styles.secondary}>All sites</Link>
            </div>
        </div>
    );
}
