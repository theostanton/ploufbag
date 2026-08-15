'use client'

import Link from 'next/link'
import type { Pilot } from '@ploufbag/common'
import styles from './FlightRow.module.css'
import pilotStyles from './PilotRow.module.css'

/**
 * A pilot in a chrome panel.
 *
 * No map hover here: a pilot is not a feature on the map, it is a filter over
 * many of them. Highlighting every one of a pilot's tracks on hover was
 * tempting and looks like noise in practice.
 */
export default function PilotRow({ pilot, flightCount }: { pilot: Pilot; flightCount?: number }) {
    return (
        <Link href={`/pilots/${pilot.pilot_id}`} className={styles.row}>
            {pilot.profile_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- Strava
                // CDN avatars, not project assets; next/image would need the
                // host allowlisted for no benefit at this size.
                <img
                    src={pilot.profile_image_url}
                    alt=""
                    className={pilotStyles.avatar}
                    loading="lazy"
                />
            ) : (
                <span className={pilotStyles.avatarFallback} aria-hidden="true">
                    🪂
                </span>
            )}
            <span className={styles.body}>
                <span className={styles.title}>{pilot.first_name}</span>
            </span>
            {flightCount !== undefined && (
                <span className={styles.numbers}>
                    <span className={styles.duration}>{flightCount}</span>
                    <span className={pilotStyles.unit}>
                        {flightCount === 1 ? 'flight' : 'flights'}
                    </span>
                </span>
            )}
        </Link>
    )
}
