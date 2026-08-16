'use client'

import {useEffect} from "react";
import Link from "next/link";
import styles from "@ui/chrome/ErrorPanel.module.css";

/**
 * A route that threw.
 *
 * Every page used to hand-roll this: six consecutive `if (errorMessage) return
 * <h1>varName={errorMessage}</h1>` blocks, unstyled, leaking the name of a local
 * variable to the reader. A boundary catches the same failures without each
 * page having to remember, and the map behind the panel is untouched — so a
 * failed query costs you a panel, not the application.
 *
 * The message itself is not shown. These come from the database layer and read
 * like `No flights for pilot_id=4210001`; the digest is what actually
 * identifies the failure in the logs.
 *
 * Scope, checked against a production standalone build rather than assumed:
 *
 *  - Navigating in-app to a route that throws renders this panel with the top
 *    bar and the live map canvas both untouched. That is the common case, since
 *    every link here is a next/link.
 *  - A cold load of a URL whose server component throws gets Next's built-in
 *    500 page instead. Catching that here would need a Suspense boundary above
 *    the segment — a loading.tsx — and that costs more than it gives: it
 *    flushes the shell early, which commits the HTTP status and turns every
 *    notFound() into a soft 404. Correct 404s on flight and site URLs, the ones
 *    published in Strava descriptions and followed by crawlers, are worth more
 *    than a prettier page for a rare cold-load failure.
 */
export default function ErrorPanel({error, reset}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Route error:', error);
    }, [error]);

    return (
        <div className={styles.panel} role="alert">
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.body}>
                We could not load this view. The map is still there — try again, or
                head back to the flights.
            </p>
            <div className={styles.actions}>
                <button type="button" onClick={reset} className={styles.retry}>
                    Try again
                </button>
                <Link href="/flights" className={styles.secondary}>
                    All flights
                </Link>
            </div>
            {error.digest && (
                <p className={styles.digest}>
                    Reference <code>{error.digest}</code>
                </p>
            )}
        </div>
    );
}
