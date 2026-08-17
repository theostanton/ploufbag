'use client'

import { useMemo } from 'react'
import styles from './MapHoverCard.module.css'
import { useHoveredFlight, useHoveredSite } from './store'
import type { BaseDataState } from './useBaseData'

function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}min`
}

/**
 * What is under the pointer.
 *
 * Until now the map answered a hover with a cursor change and a slightly
 * thicker line — enough to know something is there, not enough to know what.
 * With a hundred and sixty-five tracks crossing each other that is the
 * difference between a picture of some flying and something you can actually
 * read.
 *
 * Everything shown is already in the loaded collections, so this costs a lookup
 * and no request. Fixed to the top-right rather than following the cursor: a
 * card chasing the pointer over a map is hard to read and covers the very
 * feature you are pointing at.
 */
export default function MapHoverCard({ baseData }: { baseData: BaseDataState }) {
    const flightId = useHoveredFlight()
    const siteId = useHoveredSite()

    const content = useMemo(() => {
        if (siteId) {
            const site = baseData.sites.features.find((f) => f.properties.id === siteId)
            if (!site) return null
            const { name, alt, flightCount, color } = site.properties
            return {
                color,
                title: name,
                lines: [
                    `${alt}m`,
                    `${flightCount} ${flightCount === 1 ? 'flight' : 'flights'}`,
                ],
            }
        }
        if (flightId) {
            const flight = baseData.flights.features.find((f) => f.properties.id === flightId)
            if (!flight) return null
            const p = flight.properties
            return {
                color: p.color,
                title: `${p.takeoffName ?? 'Unknown'} → ${p.landingName ?? 'Unknown'}`,
                lines: [
                    [p.pilotName, p.wing].filter(Boolean).join(' · '),
                    `${formatDuration(p.durationSec)} · ${(p.distanceMeters / 1000).toFixed(1)} km`,
                ],
            }
        }
        return null
    }, [flightId, siteId, baseData])

    if (!content) return null

    return (
        // aria-hidden: this mirrors a pointer position, and a live region that
        // fires on every mouse move is hostile. The same information is on the
        // row the pointer is synced with, which is properly reachable.
        <div className={styles.card} data-hover-card aria-hidden="true">
            <span className={styles.accent} style={{ backgroundColor: content.color }} />
            <div className={styles.body}>
                <p className={styles.title}>{content.title}</p>
                {content.lines.filter(Boolean).map((line) => (
                    <p key={line} className={styles.line}>
                        {line}
                    </p>
                ))}
            </div>
        </div>
    )
}
