import styles from "@ui/chrome/StravaButton.module.css";
import {connectHref, SignupSource} from "@model/signup";

type Props = {
    /**
     * Where this button is being shown. Tags the click so the funnel can
     * attribute a signup to the surface that earned it.
     */
    from?: SignupSource;
    /** Smaller variant, for the top bar and the floating upsell. */
    compact?: boolean;
    /** Overrides the label. The top bar has less room than a page does. */
    label?: string;
};

/**
 * The signup button, in one place so every surface that offers it cannot drift
 * apart.
 *
 * Points at our own /connect route rather than strava.com: that round-trip is
 * what records the signup attempt and enforces the capacity gate. See
 * src/app/connect/route.ts.
 */
export default function ConnectWithStrava({from, compact, label}: Props = {}) {
    return <a
        className={compact ? `${styles.button} ${styles.compact}` : styles.button}
        href={connectHref(from)}
    >
        <svg
            width={compact ? "16" : "20"}
            height={compact ? "16" : "20"}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.172"/>
        </svg>
        {label ?? 'Connect with Strava'}
    </a>
}
