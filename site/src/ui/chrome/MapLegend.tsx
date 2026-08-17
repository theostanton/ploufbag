'use client'

import { useMemo, useState } from 'react'
import type { FlightSummary } from '@database/flights'
import { getFlightColor } from '@ui/map/colors'
import styles from './MapLegend.module.css'

/**
 * A colour key for the tracks on the map.
 *
 * Tracks are coloured per pilot-and-wing pair and nothing on the site said so —
 * you were looking at ten hues on a map with no way to learn what any of them
 * meant. This is the key.
 *
 * Only on /flights. On a pilot's own page every track is theirs, so a legend
 * there restates the page title in swatch form.
 *
 * Each entry is a filter, not a label: clicking one narrows the list to that
 * pilot, clicking it again clears. That is why they are buttons — the legend is
 * the fastest way to say "just show me Camille's flights" and it would be a
 * waste to render the same information as inert text.
 */

/** How many entries before the rest fold behind a "+N more". */
const VISIBLE = 8

type Entry = {
    key: string
    pilot: string
    wing: string
    color: string
    flights: number
}

function buildEntries(flights: FlightSummary[]): Entry[] {
    const byKey = new Map<string, Entry>()

    for (const flight of flights) {
        const wing = flight.wing || 'unknown'
        const pilotId = String(flight.pilot_id)
        const key = `${pilotId}:${wing}`
        const existing = byKey.get(key)
        if (existing) {
            existing.flights += 1
            continue
        }
        byKey.set(key, {
            key,
            pilot: flight.pilot?.first_name ?? 'Unknown pilot',
            wing,
            color: getFlightColor(pilotId, wing),
            flights: 1,
        })
    }

    // Most-flown first: the hues you will see most of are the ones worth
    // learning, and they are the ones that survive the VISIBLE cut.
    return Array.from(byKey.values()).sort((a, b) => b.flights - a.flights)
}

export default function MapLegend({
    flights,
    /** The active filter text, so a chip can show itself as the current one. */
    query,
    onSelect,
}: {
    flights: FlightSummary[]
    query: string
    onSelect: (value: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const entries = useMemo(() => buildEntries(flights), [flights])

    if (entries.length < 2) return null

    const shown = expanded ? entries : entries.slice(0, VISIBLE)
    const hidden = entries.length - shown.length

    return (
        <div className={styles.legend} role="group" aria-label="Track colours">
            {shown.map((entry) => {
                const active = query.toLowerCase() === entry.pilot.toLowerCase()
                return (
                    <button
                        key={entry.key}
                        type="button"
                        className={styles.chip}
                        aria-pressed={active}
                        onClick={() => onSelect(active ? '' : entry.pilot)}
                        title={`${entry.flights} flight${entry.flights === 1 ? '' : 's'} on ${entry.wing}`}
                    >
                        <span
                            className={styles.swatch}
                            style={{ backgroundColor: entry.color }}
                            aria-hidden="true"
                        />
                        <span className={styles.name}>{entry.pilot}</span>
                        <span className={styles.count}>{entry.wing}</span>
                    </button>
                )
            })}
            {hidden > 0 && (
                <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
                    +{hidden} more
                </button>
            )}
        </div>
    )
}
