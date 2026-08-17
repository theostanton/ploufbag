'use client'

import { useState } from 'react'
import type { Pilot } from '@ploufbag/common'
import styles from './Row.module.css'
import pilotStyles from './PilotRow.module.css'
import ClientOnlyDate from '@ui/ClientOnlyDate'
import { useIsCurrent } from './useIsCurrent'
import RowLink from './RowLink'

export type PilotListEntry = Pilot & {
    flightCount: number
    lastFlight: Date | null
}

/**
 * A pilot in a chrome panel.
 *
 * No map hover: a pilot is not a feature on the map, it is a filter over many
 * of them, and lighting up forty tracks because the pointer crossed a row is
 * noise rather than feedback.
 */
export default function PilotRow({ pilot }: { pilot: PilotListEntry }) {
    const href = `/pilots/${pilot.pilot_id}`
    const isCurrent = useIsCurrent(href)
    // Strava's CDN avatars expire and 404, and a browser's broken-image glyph
    // in a list of six pilots is worse than no avatar at all. There was a
    // fallback for a missing URL but not for a URL that fails to load, which is
    // the case that actually happens.
    const [avatarFailed, setAvatarFailed] = useState(false)
    const showAvatar = Boolean(pilot.profile_image_url) && !avatarFailed

    return (
        <div className={styles.row} data-current={isCurrent || undefined}>
            <RowLink
                href={href}
                label={`${pilot.first_name}, ${pilot.flightCount} flights`}
                isCurrent={isCurrent}
            />

            {showAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- Strava
                // CDN avatars, not project assets; next/image would need the
                // host allowlisted for no benefit at this size.
                <img
                    src={pilot.profile_image_url!}
                    alt=""
                    className={pilotStyles.avatar}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                />
            ) : (
                <span className={pilotStyles.avatarFallback} aria-hidden="true">
                    🪂
                </span>
            )}

            <span className={styles.body}>
                <span className={styles.title}>{pilot.first_name}</span>
                <span className={styles.meta}>
                    {pilot.lastFlight ? (
                        <>
                            Last flew <ClientOnlyDate date={pilot.lastFlight} format="short" />
                        </>
                    ) : (
                        'No flights yet'
                    )}
                </span>
            </span>

            <span className={styles.numbers}>
                <span className={styles.primaryValue}>{pilot.flightCount}</span>
                <span className={styles.unit}>
                    {pilot.flightCount === 1 ? 'flight' : 'flights'}
                </span>
            </span>

            <span className={styles.chevron} aria-hidden="true">›</span>
        </div>
    )
}
