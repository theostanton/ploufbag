import { afterAll, describe, expect, it } from 'vitest'
import {
    STANDOUT_MIN_SEC,
    type FlightListItem,
    formatAirtime,
    formatDistance,
    formatMonthSummary,
    groupByMonth,
    isStandout,
    matchesQuery,
    parisFullDate,
    parisMonthKey,
    parisMonthLabel,
    parisRowDay,
    standoutTag,
    standoutThreshold,
} from './flightList'

function flight(start_date: string, duration_sec = 3600, extra: Partial<FlightListItem> = {}): FlightListItem {
    return { start_date, duration_sec, ...extra }
}

describe('standouts', () => {
    it('starts at exactly 9000 s', () => {
        expect(STANDOUT_MIN_SEC).toBe(9000)
        expect(isStandout({ duration_sec: 8999 })).toBe(false)
        expect(isStandout({ duration_sec: 9000 })).toBe(true)
        expect(isStandout({ duration_sec: 9001 })).toBe(true)
    })

    it('derives the tag and the subtitle text from the constant', () => {
        expect(standoutThreshold()).toBe('2h30')
        expect(standoutTag()).toBe('2h30+')
    })
})

/**
 * Everything here is asserted once per process time zone. The functions must
 * not depend on it: the server and the viewer are rarely in Paris, and the
 * server HTML has to equal the first client render.
 */
const ZONES = [undefined, 'UTC', 'America/Los_Angeles', 'Asia/Tokyo']
const originalTz = process.env.TZ
afterAll(() => {
    process.env.TZ = originalTz
})

describe.each(ZONES)('Europe/Paris dates under TZ=%s', (zone) => {
    const useZone = () => {
        if (zone) process.env.TZ = zone
        else process.env.TZ = originalTz
    }

    it('actually runs in that zone', () => {
        useZone()
        // Guards against the zone silently not taking effect, which would make
        // every other assertion here pass for the wrong reason.
        if (zone === 'America/Los_Angeles') expect(new Date('2026-07-01T00:00Z').getHours()).toBe(17)
        if (zone === 'Asia/Tokyo') expect(new Date('2026-07-01T00:00Z').getHours()).toBe(9)
    })

    it('puts a flight in the month it is in Paris', () => {
        useZone()
        expect(parisMonthKey('2026-07-31T22:30Z')).toBe('2026-08') // 00:30 on 1 Aug in Paris
        expect(parisMonthKey('2026-07-31T21:59Z')).toBe('2026-07') // 23:59 on 31 Jul
        expect(parisMonthKey('2026-12-31T23:30Z')).toBe('2027-01') // 00:30 on 1 Jan 2027
        expect(parisMonthKey(new Date('2026-07-15T12:00Z'))).toBe('2026-07')
    })

    it('follows both DST changes', () => {
        useZone()
        // Last Sunday of March 2026 is the 29th: CET (+1) until 01:00Z, CEST (+2) after.
        expect(parisRowDay('2026-03-28T23:30Z')).toBe('Sun 29')
        expect(parisRowDay('2026-03-29T22:30Z')).toBe('Mon 30')
        expect(parisMonthKey('2026-03-31T22:30Z')).toBe('2026-04')
        // Last Sunday of October 2026 is the 25th: CEST until 01:00Z, CET after.
        expect(parisRowDay('2026-10-24T22:30Z')).toBe('Sun 25')
        expect(parisRowDay('2026-10-25T22:30Z')).toBe('Sun 25')
        expect(parisMonthKey('2026-10-31T22:30Z')).toBe('2026-10')
        expect(parisMonthKey('2026-10-31T23:30Z')).toBe('2026-11')
    })

    it('formats headings and row dates', () => {
        useZone()
        expect(parisMonthLabel('2026-07')).toBe('July 2026')
        expect(parisMonthLabel('2027-01')).toBe('January 2027')
        expect(parisRowDay('2026-12-31T12:00Z')).toBe('Thu 31')
        expect(parisFullDate('2026-07-31T12:00Z')).toBe('31 Jul 2026')
        expect(parisFullDate('2026-07-31T22:30Z')).toBe('1 Aug 2026')
        // Fixed names, not ICU's: recent en-GB data says `Sept`.
        expect(parisFullDate('2026-09-03T10:00Z')).toBe('3 Sep 2026')
    })

    it('groups by Paris month', () => {
        useZone()
        const groups = groupByMonth([flight('2026-07-31T21:59Z'), flight('2026-07-31T22:30Z')])
        expect(groups.map((g) => g.label)).toEqual(['August 2026', 'July 2026'])
    })
})

describe('groupByMonth', () => {
    const flights = [
        flight('2026-09-06T10:00Z', 9660),
        flight('2026-10-04T10:00Z', 2460),
        flight('2026-10-17T10:00Z', 4320),
        flight('2026-09-19T10:00Z', 11100),
        flight('2026-10-10T10:00Z', 9240),
        flight('2025-12-30T10:00Z', 1200),
    ]

    it('orders months newest first, and rows newest first within each', () => {
        const input = [...flights]
        const groups = groupByMonth(flights)
        expect(groups.map((g) => g.key)).toEqual(['2026-10', '2026-09', '2025-12'])
        expect(groups[0].flights.map((f) => f.start_date)).toEqual([
            '2026-10-17T10:00Z',
            '2026-10-10T10:00Z',
            '2026-10-04T10:00Z',
        ])
        expect(groups[1].flights.map((f) => f.start_date)).toEqual(['2026-09-19T10:00Z', '2026-09-06T10:00Z'])
        expect(flights).toEqual(input) // not mutated
    })

    it('carries labels, standouts and total airtime', () => {
        const [october, september, december] = groupByMonth(flights)
        expect(october.label).toBe('October 2026')
        expect(october.standouts.map((f) => f.duration_sec)).toEqual([9240])
        expect(october.totalSec).toBe(4320 + 9240 + 2460)
        expect(september.standouts).toHaveLength(2)
        expect(december.label).toBe('December 2025')
        expect(december.standouts).toEqual([])
    })

    it('sorts Date and string start dates alike', () => {
        const groups = groupByMonth([
            { start_date: new Date('2026-06-01T10:00Z'), duration_sec: 60 },
            { start_date: '2026-06-20T10:00Z', duration_sec: 60 },
        ])
        expect(groups[0].flights[0].start_date).toBe('2026-06-20T10:00Z')
    })

    it('returns nothing for no flights', () => {
        expect(groupByMonth([])).toEqual([])
    })
})

describe('formatMonthSummary', () => {
    const group = (count: number, totalSec: number) => ({ flights: new Array(count).fill(null), totalSec })

    it('counts flights and rounds hours', () => {
        expect(formatMonthSummary(group(11, 16 * 3600 + 20 * 60))).toBe('11 flights · 16 h')
        expect(formatMonthSummary(group(4, 4 * 3600 + 35 * 60))).toBe('4 flights · 5 h')
        expect(formatMonthSummary(group(2, 3600))).toBe('2 flights · 1 h')
    })

    it('shows minutes under an hour, and says 1 flight', () => {
        expect(formatMonthSummary(group(1, 40 * 60))).toBe('1 flight · 40 min')
        expect(formatMonthSummary(group(1, 59 * 60 + 29))).toBe('1 flight · 59 min')
        // Rounds up to the hour rather than claiming `60 min`.
        expect(formatMonthSummary(group(1, 59 * 60 + 31))).toBe('1 flight · 1 h')
    })

    it('says how many of the month matched during a search', () => {
        expect(formatMonthSummary(group(3, 7 * 3600), 11)).toBe('3 of 11 flights · 7 h')
        expect(formatMonthSummary(group(1, 72 * 60), 4)).toBe('1 of 4 flights · 1 h')
        expect(formatMonthSummary(group(1, 40 * 60), 1)).toBe('1 of 1 flight · 40 min')
    })

    it('reproduces the approved Search results export', () => {
        // August 2026 there: 1h 05m, 1h 18m and 2h 30m of 31 flights.
        const august = groupByMonth([
            flight('2026-08-22T10:00Z', 65 * 60),
            flight('2026-08-09T10:00Z', 78 * 60),
            flight('2026-08-02T10:00Z', 150 * 60),
        ])[0]
        expect(formatMonthSummary(august, 31)).toBe('3 of 31 flights · 5 h')
    })
})

describe('matchesQuery', () => {
    const forclaz = flight('2026-10-17T10:00Z', 4320, {
        takeoff: { name: 'Col de la Forclaz' },
        landing: { name: 'Doussard' },
        pilot: { first_name: 'Ewan' },
        wing: 'Niviuk Artik 6',
    })

    it('matches any field, case-insensitively, as a substring', () => {
        expect(matchesQuery(forclaz, 'forclaz')).toBe(true)
        expect(matchesQuery(forclaz, 'DOUSS')).toBe(true)
        expect(matchesQuery(forclaz, 'ewan')).toBe(true)
        expect(matchesQuery(forclaz, 'artik')).toBe(true)
        expect(matchesQuery(forclaz, '  Forclaz ')).toBe(true)
        expect(matchesQuery(forclaz, 'lumbin')).toBe(false)
    })

    it('matches everything on an empty query', () => {
        expect(matchesQuery(forclaz, '')).toBe(true)
        expect(matchesQuery(forclaz, '   ')).toBe(true)
    })

    it('does not throw on a missing site, pilot or wing', () => {
        const bare = flight('2026-10-17T10:00Z', 60, { takeoff: null, landing: undefined, pilot: null, wing: null })
        expect(matchesQuery(bare, 'forclaz')).toBe(false)
        expect(matchesQuery(flight('2026-10-17T10:00Z'), 'x')).toBe(false)
    })

    it('never changes what is a standout', () => {
        const long = { ...forclaz, duration_sec: 9000 }
        const before = isStandout(long)
        matchesQuery(long, 'forclaz')
        matchesQuery(long, 'nothing')
        expect(isStandout(long)).toBe(before)
        const matched = groupByMonth([long, forclaz].filter((f) => matchesQuery(f, 'forclaz')))
        expect(matched[0].standouts).toEqual([long])
    })
})

describe('row formats', () => {
    it('formats airtime as the approved exports do', () => {
        expect(formatAirtime(72 * 60)).toBe('1h 12m')
        expect(formatAirtime(185 * 60)).toBe('3h 05m')
        expect(formatAirtime(9000)).toBe('2h 30m')
        expect(formatAirtime(8999)).toBe('2h 29m')
        expect(formatAirtime(48 * 60 + 59)).toBe('48min')
        expect(formatAirtime(0)).toBe('0min')
    })

    it('formats distance in km to one decimal', () => {
        expect(formatDistance(31_400)).toBe('31.4 km')
        expect(formatDistance(34_000)).toBe('34.0 km')
        expect(formatDistance(12_649)).toBe('12.6 km')
    })
})

describe('determinism (AC 16)', () => {
    it('marks exactly the flights of 9000 s or more', () => {
        // A fixed fixture spread across the boundary and across months.
        const fixture = Array.from({ length: 200 }, (_, i) =>
            flight(new Date(Date.UTC(2026, 0, 1) + i * 37 * 3600 * 1000).toISOString(), 8990 + ((i * 7919) % 25) - 5000 * (i % 3)),
        )
        const expected = new Set(fixture.filter((f) => f.duration_sec >= 9000))
        const groups = groupByMonth(fixture)
        const marked = groups.flatMap((g) => g.standouts)
        expect(new Set(marked)).toEqual(expected)
        expect(marked.length).toBeGreaterThan(0)
        expect(marked.length).toBeLessThan(fixture.length)
        expect(groups.reduce((n, g) => n + g.flights.length, 0)).toBe(fixture.length)
        // The same input gives the same output.
        expect(groupByMonth(fixture)).toEqual(groups)
    })
})
