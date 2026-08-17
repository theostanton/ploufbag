'use client'

import { useMemo, useState } from 'react'
import type { FlightSummary } from '@database/flights'
import FlightRow from './FlightRow'
import MapLegend from './MapLegend'
import PanelFilter from './PanelFilter'
import { PanelSection } from './Panel'
import styles from './PanelFilter.module.css'

/**
 * The /flights list, filterable.
 *
 * One box matching across site names, pilot and wing rather than four separate
 * controls: with a list this size you already know roughly what you are looking
 * for — "forclaz", "camille", "rush" — and making someone choose which field
 * that word lives in is a worse question than just searching all of them.
 */
export default function FlightsPanel({ flights }: { flights: FlightSummary[] }) {
    const [query, setQuery] = useState('')

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return flights
        return flights.filter((flight) =>
            [
                flight.takeoff?.name,
                flight.landing?.name,
                flight.pilot?.first_name,
                flight.wing,
            ]
                .filter(Boolean)
                .some((field) => field!.toLowerCase().includes(needle))
        )
    }, [flights, query])

    return (
        <>
            <PanelFilter
                value={query}
                onChange={setQuery}
                placeholder="Search site, pilot or wing"
                shown={shown.length}
                total={flights.length}
            />
            {/* Keyed off the filtered set, so the key describes what is actually
                on screen rather than what could be. */}
            <MapLegend flights={shown} query={query} onSelect={setQuery}/>
            <PanelSection>
                {shown.map((flight) => (
                    <FlightRow key={flight.strava_activity_id} flight={flight} />
                ))}
                {shown.length === 0 && (
                    <p className={styles.empty}>No flights match “{query}”.</p>
                )}
            </PanelSection>
        </>
    )
}
