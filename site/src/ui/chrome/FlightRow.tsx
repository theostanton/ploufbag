'use client'

import Link from 'next/link'
import type { FlightSummary } from '@database/flights'
import styles from './FlightRow.module.css'
import ClientOnlyDate from '@ui/ClientOnlyDate'
import { formatSiteNameShort } from '@utils/formatSiteName'
import { getFlightColor } from '@ui/map/colors'
import { setHoveredFlight, useHoveredFlight } from '@ui/map/store'

/**
 * A flight in a chrome panel.
 *
 * Replaces FlightItem, which was built for a full-width document and does not
 * fit a 420px rail. Two other things changed with it:
 *
 * - It is one link. FlightItem nested a pilot <Link> inside the flight <Link>,
 *   which is invalid HTML and was the source of the hydration error on every
 *   page with a flight list. The pilot is text here; the pilot page is a click
 *   away from the flight.
 * - Hovering it highlights the track on the map, and hovering the track
 *   highlights it back. That reciprocity is what stops the list and the map
 *   feeling like two separate things.
 */
export default function FlightRow({ flight }: { flight: FlightSummary }) {
    const id = String(flight.strava_activity_id)
    const hoveredId = useHoveredFlight()
    const isHovered = hoveredId === id

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}min`
    }

    return (
        <Link
            href={`/flights/${id}`}
            className={styles.row}
            data-hovered={isHovered || undefined}
            onMouseEnter={() => setHoveredFlight(id)}
            onMouseLeave={() => setHoveredFlight(null)}
            // Keyboard users get the same map highlight as pointer users; without
            // this, tabbing through the list moves focus with no feedback on the
            // map at all.
            onFocus={() => setHoveredFlight(id)}
            onBlur={() => setHoveredFlight(null)}
        >
            {/* The same colour the track is drawn in, so the row and the line on
                the map are recognisably the same flight. */}
            <span
                className={styles.swatch}
                style={{ backgroundColor: getFlightColor(String(flight.pilot_id), flight.wing || 'unknown') }}
                aria-hidden="true"
            />
            <span className={styles.body}>
                <span className={styles.title}>
                    {flight.takeoff ? formatSiteNameShort(flight.takeoff.name) : 'Unknown'}
                    <span className={styles.arrow} aria-hidden="true"> → </span>
                    {flight.landing ? formatSiteNameShort(flight.landing.name) : 'Unknown'}
                </span>
                <span className={styles.meta}>
                    {flight.pilot ? `${flight.pilot.first_name} · ` : ''}
                    {flight.wing}
                </span>
            </span>
            <span className={styles.numbers}>
                <span className={styles.duration}>{formatDuration(flight.duration_sec)}</span>
                <span className={styles.distance}>
                    {(flight.distance_meters / 1000).toFixed(1)} km
                </span>
                <span className={styles.date}>
                    <ClientOnlyDate date={flight.start_date} format="short" />
                </span>
            </span>
        </Link>
    )
}
