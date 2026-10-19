'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { FlightSummary } from '@database/flights'
import {
    formatMonthSummary,
    groupByMonth,
    matchesQuery,
} from '@ploufbag/common/dist/flightList'
import MonthGroup from './MonthGroup'
import PanelFilter from './PanelFilter'
import styles from './PanelFilter.module.css'
import { usePanelScroller } from './Sheet'
import { consumeTraversal } from './traversal'

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
 *
 * Going back to the list puts the reader where they were — the search, the
 * months they opened and the scroll position — and arriving any other way
 * starts at the top. The search is also in the URL; the rest is not (Q4).
 */
export default function FlightsPanel({
    flights,
    initialQuery = '',
}: {
    flights: FlightSummary[]
    /** `?q=`, read on the server so the first HTML is already filtered. */
    initialQuery?: string
}) {
    const [query, setQuery] = useState(initialQuery)
    // Months the reader opened. Not in the URL (Q4): a shared link opens the
    // default view, and only back or forward brings them back.
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    // A scroll position waiting for the restored months to be rendered.
    const [pendingScroll, setPendingScroll] = useState<number | null>(null)
    const input = useRef<HTMLInputElement>(null)
    const scroller = usePanelScroller()
    const pathname = usePathname()

    // What is saved, kept current here so the save on unmount never reads the
    // DOM: by then the next route has replaced the rows, and the scroller's
    // position has been clamped to it.
    const latest = useRef<Snapshot>({ q: initialQuery, expanded: [], scrollTop: 0 })
    useLayoutEffect(() => {
        latest.current.q = query
        latest.current.expanded = Array.from(expanded)
    }, [query, expanded])

    // Restore, on back or forward only. A layout effect, so the restored state
    // renders before the first paint instead of the default view flashing
    // first; and never during hydration, since a first load or a reload is not
    // a traversal and sessionStorage is not read at all.
    //
    // The months are restored here and the scroll position only once they are
    // rendered (below): scrolling first would land in a list that is still
    // collapsed, and the reader would come back somewhere else.
    const arrival = useRef<{ q: string; saved: Snapshot | null } | false | null>(null)
    useLayoutEffect(() => {
        // Decided, and the snapshot read, once per mount. Strict Mode runs this
        // twice with a simulated unmount between, and that unmount saves the
        // not-yet-restored state over the snapshot.
        arrival.current ??= consumeTraversal(pathname) && {
            // The URL is the truth for the search: this history entry is where
            // it was written. The router may hand back the page as it was first
            // rendered, before any typing.
            q: new URLSearchParams(window.location.search).get('q') ?? '',
            saved: readSnapshot(),
        }
        if (!arrival.current) {
            // A link to /flights starts at the top, wherever the sheet was.
            if (scroller) scroller.scrollTop = 0
            // Anything typed into the server-rendered box before hydration is
            // in the DOM but not in state; take it rather than lose it.
            const typed = input.current?.value
            if (typed !== undefined && typed !== initialQuery) search(typed)
            return
        }
        const { q, saved } = arrival.current
        setQuery(q)
        // A snapshot from a different visit to /flights (another history
        // entry, another search) would put the reader somewhere they never were.
        if (saved && saved.q === q) {
            setExpanded(new Set(saved.expanded))
            setPendingScroll(saved.scrollTop)
        } else {
            setPendingScroll(0)
        }
        // Mount only: this is about how the panel was arrived at.
    }, [])

    useLayoutEffect(() => {
        if (pendingScroll === null || !scroller) return
        scroller.scrollTop = pendingScroll
        latest.current.scrollTop = scroller.scrollTop
        setPendingScroll(null)
    }, [pendingScroll, scroller])

    // Save on scroll, throttled, and on unmount. A layout effect, so the
    // listener is gone before the next route's rows can move the scroller.
    useLayoutEffect(() => {
        if (!scroller) return
        let timer: ReturnType<typeof setTimeout> | undefined
        const onScroll = () => {
            latest.current.scrollTop = scroller.scrollTop
            timer ??= setTimeout(() => {
                timer = undefined
                writeSnapshot(latest.current)
            }, SAVE_THROTTLE_MS)
        }
        scroller.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            scroller.removeEventListener('scroll', onScroll)
            clearTimeout(timer)
            writeSnapshot(latest.current)
        }
    }, [scroller])

    // The search goes in the URL so a reload or a shared link keeps it.
    // replaceState, not the router: one history entry for the whole search
    // rather than one per character, and no server round-trip per keystroke.
    // The app router keeps useSearchParams in step with it.
    const search = (value: string) => {
        setQuery(value)
        const url = new URL(window.location.href)
        if (value.trim() === '') url.searchParams.delete('q')
        else url.searchParams.set('q', value)
        // null, not history.state: the router recognises its own state object
        // and would skip syncing with the new URL.
        window.history.replaceState(null, '', url)
    }

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

    // Stable, so the memoised months it is passed to are not all re-rendered
    // when one of them opens.
    const toggle = useCallback((key: string) =>
        setExpanded((current) => {
            const next = new Set(current)
            if (!next.delete(key)) next.add(key)
            return next
        }), [])

    const clearSearch = () => {
        search('')
        input.current?.focus()
    }

    return (
        <>
            <PanelFilter
                ref={input}
                value={query}
                onChange={search}
                placeholder="Search site, pilot or wing"
                shown={shownCount}
                total={flights.length}
            />
            {matches
                ? matches.map(({ month, hits, summary }) => (
                    <MonthGroup key={month.key} monthKey={month.key} label={month.label} summary={summary} rows={hits}/>
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
                            rows={open ? month.flights : month.standouts}
                            {...(collapsible && {
                                expanded: open,
                                flights: month.flights,
                                standouts: month.standouts,
                                onToggle: toggle,
                            })}
                        />
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

/**
 * Where the reader was, for back and forward. One per tab (sessionStorage), and
 * only one: it describes the last visit, which is the one back returns to.
 */
type Snapshot = { q: string; expanded: string[]; scrollTop: number }

const SNAPSHOT_KEY = 'ploufbag:flights-panel'
const SAVE_THROTTLE_MS = 200

function readSnapshot(): Snapshot | null {
    try {
        const raw = sessionStorage.getItem(SNAPSHOT_KEY)
        if (!raw) return null
        const value = JSON.parse(raw)
        if (
            typeof value?.q !== 'string' ||
            !Array.isArray(value.expanded) ||
            typeof value.scrollTop !== 'number'
        ) return null
        return { q: value.q, expanded: value.expanded.filter((key: unknown) => typeof key === 'string'), scrollTop: value.scrollTop }
    } catch {
        // Private browsing and some embedded webviews throw on access; a
        // corrupt entry throws on parse. Either way, the default view.
        return null
    }
}

function writeSnapshot(snapshot: Snapshot) {
    try {
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    } catch {
        // Back will open the default view. Nothing worse.
    }
}
