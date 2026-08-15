import styles from "@styles/Page.module.css";

/**
 * The signup button, in one place so the home page and the login page cannot
 * drift apart.
 *
 * Points at our own /connect route rather than strava.com: that round-trip is
 * what records the signup attempt and enforces the capacity gate. See
 * src/app/connect/route.ts.
 */
export default function ConnectWithStrava() {
    return <a className={styles.stravaButton} href="/connect">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.172"/>
        </svg>
        Connect with Strava
    </a>
}
