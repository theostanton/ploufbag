'use client'

import { memo } from 'react'
import Link from 'next/link'
import type { FlightSummary } from '@database/flights'
import {
    formatAirtime,
    formatDistance,
    parisFullDate,
    parisRowDay,
    standoutTag,
} from '@ploufbag/common/dist/flightList'
import styles from './Row.module.css'
import { formatSiteNameShort } from '@utils/formatSiteName'
import { getFlightColor } from '@ui/map/colors'
import { setHoveredFlight, useIsFlightHovered } from '@ui/map/store'
import { useIsCurrent } from './useIsCurrent'
import RowLink from './RowLink'

export type FlightRowProps = {
    flight: FlightSummary
    /**
     * `day` (`Fri 31`) inside /flights, where the month heading carries the
     * rest; `full` (`31 Jul 2026`) everywhere else, where there is no heading.
     */
    dateStyle: 'day' | 'full'
    /** A 2h30+ flight on /flights: tag, wider bar, airtime in the brand colour. */
    standout?: boolean
}

/**
 * A flight in a chrome panel.
 *
 * Line 1 is the route, because that is what a pilot remembers a flight by.
 * Line 2 is who, on what, and when. Airtime and distance sit in a right column
 * that never wraps, so the numbers line up down the list.
 *
 * Several things in the row are links, not one: the flight itself (stretched
 * across the row and first in tab order), then its takeoff, landing, pilot and
 * wing. Hovering or focusing the row highlights the track on the map, and
 * hovering the track highlights the row.
 *
 * The date is Europe/Paris with fixed names (see common's flightList), so the
 * server HTML and the first client render are the same text: no ClientOnlyDate,
 * no flash, no hydration warning.
 *
 * Memoised: /flights renders hundreds of these, and every keystroke in its
 * search box re-renders the panel.
 */
function FlightRow({ flight, dateStyle, standout = false }: FlightRowProps) {
    const id = String(flight.strava_activity_id)
    const href = `/flights/${id}`
    const isHovered = useIsFlightHovered(id)
    const isCurrent = useIsCurrent(href)

    const wing = flight.wing || 'unknown'
    const takeoff = flight.takeoff ? formatSiteNameShort(flight.takeoff.name) : 'Unknown'
    const landing = flight.landing ? formatSiteNameShort(flight.landing.name) : 'Unknown'
    const date = dateStyle === 'day' ? parisRowDay(flight.start_date) : parisFullDate(flight.start_date)
    const airtime = formatAirtime(flight.duration_sec)

    return (
        <div
            className={`${styles.row} ${styles.flight}`}
            data-hovered={isHovered || undefined}
            data-current={isCurrent || undefined}
            data-standout={standout || undefined}
            onMouseEnter={() => setHoveredFlight(id)}
            onMouseLeave={() => setHoveredFlight(null)}
        >
            {/* Stretched across the row, under the names above it. The label
                carries what the visual row says, since the link itself is
                empty. Focus mirrors hover, so tabbing the list lights up the
                map the way pointing at it does. */}
            <RowLink
                href={href}
                label={`Flight from ${takeoff} to ${landing} on ${wing}, ${date}, ${airtime}${standout ? `, ${standoutTag()}` : ''}`}
                isCurrent={isCurrent}
                onFocus={() => setHoveredFlight(id)}
                onBlur={() => setHoveredFlight(null)}
            />

            {/* The colour the track is drawn in, custom wing colour included. */}
            <span
                className={styles.swatch}
                style={{ backgroundColor: getFlightColor(String(flight.pilot_id), wing, flight.wing_colour) }}
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
                <span className={styles.metaLine}>
                    {standout && <span className={styles.tag}>{standoutTag()}</span>}
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
                        {' · '}
                        {date}
                    </span>
                </span>
            </span>

            <span className={styles.numbers}>
                <span className={styles.primaryValue}>{airtime}</span>
                <span className={styles.secondaryValue}>{formatDistance(flight.distance_meters)}</span>
            </span>

            <span className={styles.chevron} aria-hidden="true">›</span>
        </div>
    )
}

export default memo(FlightRow)
