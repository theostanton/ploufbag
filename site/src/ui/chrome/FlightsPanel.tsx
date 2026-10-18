'use client'

import { useMemo, useRef, useState } from 'react'
import type { FlightSummary } from '@database/flights'
import {
    formatMonthSummary,
    groupByMonth,
    isStandout,
    matchesQuery,
} from '@ploufbag/common/dist/flightList'
import FlightRow from './FlightRow'
import MonthGroup from './MonthGroup'
import PanelFilter from './PanelFilter'
import styles from './PanelFilter.module.css'

/**
 * The /flights list, read as a season, month by month (D-1).
 *
 * The newest month is shown in full. Older months show only their standouts
 * (D-2) and a row to show the rest, so a long season reads as its highlights
 * rather than as a wall of rows. "Newest" is the newest month that has flights,
 * never today's date: the server and the first client render have to agree.
 *
 * Searching is different: every month with a match is shown in full, months
 * without one disappear, and each heading says how many of its flights matched.
 * Collapsing is a reading aid, not a filter, so it never hides a result and
 * never changes the count in the search box.
 *
 * One box matching across site names, pilot and wing rather than four separate
 * controls: with a list this size you already know roughly what you are looking
 * for — "forclaz", "camille", "rush" — and making someone choose which field
 * that word lives in is a worse question than just searching all of them.
 */
export default function FlightsPanel({ flights }: { flights: FlightSummary[] }) {
    const [query, setQuery] = useState('')
    // Months the reader opened. Component state for now: it is lost on
    // navigation, and restoring it on back is a later task.
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    const input = useRef<HTMLInputElement>(null)

    const months = useMemo(() => groupByMonth(flights), [flights])
    const searching = query.trim() !== ''

    const matches = useMemo(() => {
        if (!searching) return null
        return months.flatMap((month) => {
            const hits = month.flights.filter((flight) => matchesQuery(flight, query))
            if (hits.length === 0) return []
            const totalSec = hits.reduce((sum, flight) => sum + flight.duration_sec, 0)
            return [{ month, hits, summary: formatMonthSummary({ flights: hits, totalSec }, month.flights.length) }]
        })
    }, [months, query, searching])

    const shownCount = matches
        ? matches.reduce((sum, match) => sum + match.hits.length, 0)
        : flights.length

    const toggle = (key: string) =>
        setExpanded((current) => {
            const next = new Set(current)
            if (!next.delete(key)) next.add(key)
            return next
        })

    const clearSearch = () => {
        setQuery('')
        input.current?.focus()
    }

    return (
        <>
            <PanelFilter
                ref={input}
                value={query}
                onChange={setQuery}
                placeholder="Search site, pilot or wing"
                shown={shownCount}
                total={flights.length}
            />
            {matches
                ? matches.map(({ month, hits, summary }) => (
                    <MonthGroup key={month.key} monthKey={month.key} label={month.label} summary={summary}>
                        {hits.map((flight) => row(flight))}
                    </MonthGroup>
                ))
                : months.map((month, index) => {
                    const newest = index === 0
                    const open = newest || expanded.has(month.key)
                    // A month that is all standouts has nothing more to show.
                    const collapsible = !newest && month.standouts.length < month.flights.length
                    return (
                        <MonthGroup
                            key={month.key}
                            monthKey={month.key}
                            label={month.label}
                            summary={formatMonthSummary(month)}
                            toggle={collapsible ? {
                                expanded: open,
                                total: month.flights.length,
                                label: month.label,
                                onToggle: () => toggle(month.key),
                            } : undefined}
                        >
                            {(open ? month.flights : month.standouts).map((flight) => row(flight))}
                        </MonthGroup>
                    )
                })}
            {matches?.length === 0 && (
                <div className={styles.noResults}>
                    <p className={styles.noResultsTitle}>No flights match “{query.trim()}”</p>
                    <p className={styles.noResultsDetail}>Try the name of a site, pilot or wing.</p>
                    <button type="button" className={styles.clear} onClick={clearSearch}>
                        Clear search
                    </button>
                </div>
            )}
        </>
    )
}

function row(flight: FlightSummary) {
    return (
        <FlightRow
            key={flight.strava_activity_id}
            flight={flight}
            dateStyle="day"
            standout={isStandout(flight)}
        />
    )
}
