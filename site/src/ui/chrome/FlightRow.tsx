'use client'

import Link from 'next/link'
import type { FlightSummary } from '@database/flights'
import styles from './Row.module.css'
import ClientOnlyDate from '@ui/ClientOnlyDate'
import { formatSiteNameShort } from '@utils/formatSiteName'
import { getFlightColor } from '@ui/map/colors'
import { setHoveredFlight, useIsFlightHovered } from '@ui/map/store'
import { useIsCurrent } from './useIsCurrent'
import RowLink from './RowLink'

function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}min`
}

/**
 * A flight in a chrome panel.
 *
 * Four things in this row are links, not one: the flight itself (stretched
 * across the row), its takeoff, its landing, the pilot and the wing. A flight
 * is a junction between all of those, and until now the row would only take you
 * to the flight — every other name on it was dead text you had to go and find
 * elsewhere.
 *
 * Hovering the row highlights the track on the map, and hovering the track
 * highlights the row. That reciprocity is what stops the list and the map
 * feeling like two separate things.
 */
export default function FlightRow({ flight }: { flight: FlightSummary }) {
    const id = String(flight.strava_activity_id)
    const href = `/flights/${id}`
    const isHovered = useIsFlightHovered(id)
    const isCurrent = useIsCurrent(href)

    const wing = flight.wing || 'unknown'
    const takeoff = flight.takeoff ? formatSiteNameShort(flight.takeoff.name) : 'Unknown'
    const landing = flight.landing ? formatSiteNameShort(flight.landing.name) : 'Unknown'

    return (
        <div
            className={styles.row}
            data-hovered={isHovered || undefined}
            data-current={isCurrent || undefined}
            onMouseEnter={() => setHoveredFlight(id)}
            onMouseLeave={() => setHoveredFlight(null)}
        >
            {/* Stretched across the row, under the names above it. The label
                carries what the visual row says, since the link itself is
                empty. Focus mirrors hover, so tabbing the list lights up the
                map the way pointing at it does. */}
            <RowLink
                href={href}
                label={`Flight from ${takeoff} to ${landing} on ${wing}`}
                isCurrent={isCurrent}
                onFocus={() => setHoveredFlight(id)}
                onBlur={() => setHoveredFlight(null)}
            />

            <span
                className={styles.swatch}
                style={{ backgroundColor: getFlightColor(String(flight.pilot_id), wing) }}
                aria-hidden="true"
            />

            <span className={styles.body}>
                <span className={styles.title}>
                    {flight.takeoff ? (
                        <Link href={`/sites/${flight.takeoff.slug}`} className={styles.inline}>
                            {takeoff}
                        </Link>
                    ) : (
                        takeoff
                    )}
                    <span className={styles.arrow} aria-hidden="true"> → </span>
                    {flight.landing ? (
                        <Link href={`/sites/${flight.landing.slug}`} className={styles.inline}>
                            {landing}
                        </Link>
                    ) : (
                        landing
                    )}
                </span>
                <span className={styles.meta}>
                    {flight.pilot && (
                        <>
                            <Link
                                href={`/pilots/${flight.pilot.pilot_id}`}
                                className={styles.inline}
                            >
                                {flight.pilot.first_name}
                            </Link>
                            {' · '}
                        </>
                    )}
                    <Link
                        href={`/pilots/${flight.pilot_id}/${encodeURIComponent(wing.toLowerCase())}`}
                        className={styles.inline}
                    >
                        {wing}
                    </Link>
                </span>
            </span>

            <span className={styles.numbers}>
                <span className={styles.primaryValue}>{formatDuration(flight.duration_sec)}</span>
                <span className={styles.secondaryValue}>
                    {(flight.distance_meters / 1000).toFixed(1)} km
                </span>
                <span className={styles.secondaryValue}>
                    <ClientOnlyDate date={flight.start_date} format="short" />
                </span>
            </span>

            <span className={styles.chevron} aria-hidden="true">›</span>
        </div>
    )
}
