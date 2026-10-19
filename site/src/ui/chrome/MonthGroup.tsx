'use client'

import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { FlightSummary } from '@database/flights'
import { isStandout } from '@ploufbag/common/dist/flightList'
import { getFlightColor } from '@ui/map/colors'
import { useHoveredFlightAmong } from '@ui/map/store'
import FlightRow from './FlightRow'
import styles from './MonthGroup.module.css'

export type MonthGroupToggle = {
    expanded: boolean
    /**
     * The month's flights and its standouts, as grouped: what is hidden while
     * collapsed is the difference, and `flights.length` is the count the
     * button offers. Stable references, so the hover subscription below is not
     * rebuilt on every render of the panel.
     */
    flights: readonly FlightSummary[]
    standouts: readonly FlightSummary[]
}

/**
 * One month of /flights: a heading, its rows, and -- on a month that is showing
 * only its standouts, or was expanded from that -- the row that switches
 * between the two.
 *
 * The heading is a real <h2>, so a screen reader can walk the season month by
 * month. It does not stick (Decision 5): the panel is short enough that a
 * pinned heading costs more room than it saves.
 *
 * Expanding and collapsing happen in place. The toggle stays where it was on
 * screen, the rows above it grow or shrink, and focus stays on the toggle --
 * collapsing a long month at the bottom of the panel would otherwise throw the
 * reader somewhere they never asked to go.
 *
 * Pointing at the track of a flight the month is hiding lights up the toggle
 * the way it would have lit up the row, colour bar and all (D-3). It does not
 * expand the month or scroll to it: the map is where the pointer is, and the
 * list moving under it would be the surprise.
 *
 * Memoised, and every prop is a string or a reference the panel keeps stable
 * (the grouped arrays, a shared onToggle), so expanding one month or typing a
 * search re-renders only the months whose rows changed. With a thousand flights
 * expanded that is the difference between rendering one month and all of them.
 */
function MonthGroup({
    monthKey,
    label,
    summary,
    rows,
    expanded,
    flights,
    standouts,
    onToggle,
}: {
    monthKey: string
    /** `September 2026` */
    label: string
    summary: string
    /** The flights to show, in order. */
    rows: readonly FlightSummary[]
    /** Absent on a month with no toggle: the newest, a search result, all standouts. */
    expanded?: boolean
    flights?: readonly FlightSummary[]
    standouts?: readonly FlightSummary[]
    /** Called with `monthKey`, so one function serves every month. */
    onToggle?: (monthKey: string) => void
}) {
    const headingId = `month-${monthKey}`

    return (
        <section className={styles.group} aria-labelledby={headingId}>
            <div className={styles.head}>
                <h2 id={headingId} className={styles.label}>{label}</h2>
                <span className={styles.summary}>{summary}</span>
            </div>
            {rows.map((flight) => (
                <FlightRow
                    key={flight.strava_activity_id}
                    flight={flight}
                    dateStyle="day"
                    standout={isStandout(flight)}
                />
            ))}
            {expanded !== undefined && flights && standouts && onToggle && (
                <ToggleRow
                    expanded={expanded}
                    flights={flights}
                    standouts={standouts}
                    label={label}
                    onToggle={() => onToggle(monthKey)}
                />
            )}
        </section>
    )
}

export default memo(MonthGroup)

function ToggleRow({
    expanded,
    label,
    onToggle,
    flights,
    standouts,
}: MonthGroupToggle & { label: string; onToggle: () => void }) {
    const total = flights.length
    const button = useRef<HTMLButtonElement>(null)

    // Flights this month is not showing, by id. Nothing is hidden once the
    // month is open, so an expanded month subscribes to nothing in particular.
    const hidden = useMemo(() => {
        if (expanded) return null
        const shown = new Set(standouts)
        const byId = new Map<string, FlightSummary>()
        for (const flight of flights) {
            if (!shown.has(flight)) byId.set(String(flight.strava_activity_id), flight)
        }
        return byId
    }, [expanded, flights, standouts])
    const hoveredId = useHoveredFlightAmong(hidden)
    const hovered = hoveredId !== null ? hidden?.get(hoveredId) : undefined

    // Where the button sat on screen before the click, to hold it there after.
    const anchor = useRef<number | null>(null)

    useLayoutEffect(() => {
        const top = anchor.current
        const element = button.current
        anchor.current = null
        if (top === null || !element) return
        const drift = element.getBoundingClientRect().top - top
        const scroller = scrollParent(element)
        if (drift !== 0 && scroller) scroller.scrollTop += drift
    }, [expanded])

    const text = expanded
        ? 'Show standouts only'
        : total === 1
            ? `Show 1 flight in ${label}`
            : `Show all ${total} flights in ${label}`

    return (
        <button
            ref={button}
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            data-hovered={hovered ? true : undefined}
            onClick={() => {
                anchor.current = button.current?.getBoundingClientRect().top ?? null
                onToggle()
            }}
        >
            {/* The hovered flight's track colour, where the row's bar would be. */}
            {hovered && (
                <span
                    className={styles.swatch}
                    style={{
                        backgroundColor: getFlightColor(
                            String(hovered.pilot_id),
                            hovered.wing || 'unknown',
                            hovered.wing_colour
                        ),
                    }}
                    aria-hidden="true"
                />
            )}
            {text}
            <svg
                className={styles.chevron}
                data-expanded={expanded || undefined}
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
            >
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </button>
    )
}

/** The nearest ancestor that scrolls: the rail on desktop, the sheet on a phone. */
function scrollParent(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node)
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
            return node
        }
    }
    return document.scrollingElement as HTMLElement | null
}
