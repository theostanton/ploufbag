import styles from './PanelFooter.module.css'

/**
 * The bottom of every panel: Strava attribution, and the byline the old
 * document footer carried.
 *
 * Strava's API agreement requires apps displaying their data to show "Powered
 * by Strava". It was missing from the site entirely — the same class of gap as
 * the Mapbox attribution that had been switched off.
 *
 * It lives at the foot of the panel rather than as another floating chip over
 * the map. Everything in the panel *is* Strava data, so the attribution belongs
 * with it; and the map's bottom-right corner already carries Mapbox's wordmark
 * and the map controls, which is enough for one corner.
 *
 * This also restores the "Built by theo.dev" byline, which went with the
 * document footer when the layout became a map.
 */
export default function PanelFooter() {
    return (
        <footer className={styles.footer}>
            <span className={styles.strava}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.172"/>
                </svg>
                Powered by Strava
            </span>
            <a href="https://theo.dev" className={styles.byline}>
                Built by theo.dev
            </a>
        </footer>
    )
}
