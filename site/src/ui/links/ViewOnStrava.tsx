import type {StravaAthleteId, StravaActivityId} from "@ploufbag/common";
import Link from "next/link";
import styles from "./Links.module.css"

export default function ViewOnStrava({flightId}: { flightId: StravaActivityId }) {
    return <Link href={`https://www.strava.com/activities/${flightId}`} target="_blank" rel="noopener noreferrer">
        <div className={styles.ViewOnStrava}>View on Strava</div>
    </Link>
}