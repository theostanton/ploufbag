/**
 * The /flights list as a season: which flights stand out, which month each one
 * belongs to, what each month's heading says, and what a search matches.
 *
 * It lives here rather than in the site's panel for the same reason
 * trackColours.ts does: common's tests run in CI and the site's do not, and QA
 * has to be able to recompute the standout rule against the code that draws it.
 * Like trackColours.ts it has no Node imports and is reached only by deep import
 * as `@ploufbag/common/dist/flightList` -- index.ts re-exports the database
 * layer, which must not reach a client bundle.
 *
 * Every function here is pure and time-zone independent. Months and dates are
 * Europe/Paris, whatever zone the server or the viewer is in, and nothing reads
 * the clock: the newest month is the newest month that has flights. That is what
 * lets the server HTML and the first client render agree.
 */

// ===================================
// STANDOUTS
// ===================================

/**
 * A flight of 2 h 30 or more of airtime is a standout (D-2).
 *
 * This is the only place the threshold lives. The tag, the panel's subtitle and
 * QA's recomputation all derive from it, so changing it is one commit.
 */
export const STANDOUT_MIN_SEC = 9000

export function isStandout(flight: { duration_sec: number }): boolean {
    return flight.duration_sec >= STANDOUT_MIN_SEC
}

/** The threshold as the subtitle says it: `2h30` ("Flights of 2h30 or more are marked."). */
export function standoutThreshold(): string {
    const hours = Math.floor(STANDOUT_MIN_SEC / 3600)
    const minutes = Math.floor((STANDOUT_MIN_SEC % 3600) / 60)
    return minutes > 0 ? `${hours}h${pad2(minutes)}` : `${hours}h`
}

/** The tag a standout row carries: `2h30+`. */
export function standoutTag(): string {
    return `${standoutThreshold()}+`
}

// ===================================
// EUROPE/PARIS DATES
// ===================================

/**
 * Month and weekday names, fixed rather than taken from Intl.
 *
 * Intl only resolves which Paris day a moment falls on. Its names are left out
 * because they drift between ICU versions -- en-GB's short September became
 * `Sept` in recent ICU -- and a server and a browser on different versions
 * would then render different text for the same date, which is a hydration
 * mismatch.
 */
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PARIS = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
})

type ParisDay = { year: number; month: number; day: number }

/** Summaries cross the RSC boundary, so a date may arrive as a Date or an ISO string. */
export type DateInput = Date | string

function parisDay(date: DateInput): ParisDay {
    const parts = PARIS.formatToParts(new Date(date))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value)
    return { year: part('year'), month: part('month'), day: part('day') }
}

function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

/** The Paris month a flight belongs to: `2026-07`. Sorts lexically. */
export function parisMonthKey(date: DateInput): string {
    const { year, month } = parisDay(date)
    return `${year}-${pad2(month)}`
}

/** A month key as its heading: `2026-07` → `July 2026`. */
export function parisMonthLabel(key: string): string {
    const [year, month] = key.split('-').map(Number)
    return `${MONTHS[month - 1]} ${year}`
}

/** A row's date inside its month: `Thu 31`. */
export function parisRowDay(date: DateInput): string {
    const { year, month, day } = parisDay(date)
    // The weekday of a calendar date, which is the same in every zone.
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return `${WEEKDAYS[weekday]} ${day}`
}

/** A row's date outside /flights: `31 Jul 2026`. */
export function parisFullDate(date: DateInput): string {
    const { year, month, day } = parisDay(date)
    return `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`
}

// ===================================
// MONTH GROUPS
// ===================================

/**
 * What the list needs of a flight. FlightSummary satisfies it; the functions
 * below are generic so they hand back whatever they were given.
 */
export type FlightListItem = {
    duration_sec: number
    distance_meters?: number
    start_date: DateInput
    wing?: string | null
    takeoff?: { name: string } | null
    landing?: { name: string } | null
    pilot?: { first_name: string } | null
}

export type MonthGroup<F extends FlightListItem = FlightListItem> = {
    /** `2026-07` */
    key: string
    /** `July 2026` */
    label: string
    /** Newest first. */
    flights: F[]
    /** The standouts among `flights`, in the same order. */
    standouts: F[]
    /** Total airtime of `flights`. */
    totalSec: number
}

function time(date: DateInput): number {
    return new Date(date).getTime()
}

/**
 * Flights by Paris month (D-1): newest month first, newest flight first within
 * each. Months with no flights are absent. The input is not mutated.
 */
export function groupByMonth<F extends FlightListItem>(flights: readonly F[]): MonthGroup<F>[] {
    const sorted = [...flights].sort((a, b) => time(b.start_date) - time(a.start_date))
    const groups: MonthGroup<F>[] = []
    for (const flight of sorted) {
        const key = parisMonthKey(flight.start_date)
        let group = groups[groups.length - 1]
        if (!group || group.key !== key) {
            group = { key, label: parisMonthLabel(key), flights: [], standouts: [], totalSec: 0 }
            groups.push(group)
        }
        group.flights.push(flight)
        if (isStandout(flight)) group.standouts.push(flight)
        group.totalSec += flight.duration_sec
    }
    return groups
}

/**
 * A month heading's summary: `11 flights · 16 h`, `1 flight · 40 min`.
 *
 * During a search, pass the group of matching flights and, as `matchedOf`, how
 * many flights the whole month has: `3 of 11 flights · 7 h`, where the airtime
 * is the matches'. Hours are rounded; under an hour shows minutes.
 */
export function formatMonthSummary(
    group: Pick<MonthGroup, 'flights' | 'totalSec'>,
    matchedOf?: number,
): string {
    const count = group.flights.length
    const noun = (matchedOf ?? count) === 1 ? 'flight' : 'flights'
    const flights = matchedOf === undefined ? `${count} ${noun}` : `${count} of ${matchedOf} ${noun}`
    return `${flights} · ${formatTotalAirtime(group.totalSec)}`
}

function formatTotalAirtime(sec: number): string {
    const minutes = Math.round(sec / 60)
    return minutes < 60 ? `${minutes} min` : `${Math.round(sec / 3600)} h`
}

// ===================================
// SEARCH
// ===================================

/**
 * Whether a flight matches the search box: a case-insensitive substring of its
 * takeoff, landing, pilot's first name or wing (Q1 = A). An empty query matches
 * everything; a missing site, pilot or wing is simply not matched against.
 */
export function matchesQuery(flight: FlightListItem, query: string): boolean {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [flight.takeoff?.name, flight.landing?.name, flight.pilot?.first_name, flight.wing]
        .some((field) => !!field && field.toLowerCase().includes(needle))
}

// ===================================
// ROW FORMATS
// ===================================

/** A row's airtime, as the approved exports show it: `1h 12m`, `3h 05m`, `48min`. */
export function formatAirtime(sec: number): string {
    const hours = Math.floor(sec / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    return hours > 0 ? `${hours}h ${pad2(minutes)}m` : `${minutes}min`
}

/** A row's distance: `31.4 km`. */
export function formatDistance(meters: number): string {
    return `${(meters / 1000).toFixed(1)} km`
}
