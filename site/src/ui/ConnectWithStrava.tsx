import styles from "@styles/Page.module.css";
import {connectHref, SignupSource} from "@model/signup";

type Props = {
    /**
     * Where this button is being shown. Tags the click so the funnel can
     * attribute a signup to the page that earned it; omitted on the home and
     * login pages, which are the untagged default.
     */
    from?: SignupSource;
    /** Smaller variant, for the upsell banner where the button is not the page's subject. */
    compact?: boolean;
};

/**
 * The signup button, in one place so the home page, the login page and the
 * detail-page banner cannot drift apart.
 *
 * Points at our own /connect route rather than strava.com: that round-trip is
 * what records the signup attempt and enforces the capacity gate. See
 * src/app/connect/route.ts.
 */
export default function ConnectWithStrava({from, compact}: Props = {}) {
    return <a
        className={compact ? `${styles.stravaButton} ${styles.stravaButtonCompact}` : styles.stravaButton}
        href={connectHref(from)}
    >
        <svg width={compact ? "16" : "20"} height={compact ? "16" : "20"} viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.172"/>
        </svg>
        Connect with Strava
    </a>
}
