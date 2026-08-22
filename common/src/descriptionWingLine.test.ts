import { describe, expect, it } from 'vitest'
import { DescriptionFormatterClient } from './DescriptionFormatterClient'
import { hasWingName } from './utils'
import type { DescriptionPreference, FlightRow } from './types'

/**
 * What gets written onto a pilot's Strava activity when we do not know which
 * wing they were flying.
 *
 * `flights.wing` became nullable so that a flight we cannot attribute survives
 * as an unattributed flight rather than being discarded. The hazard that
 * introduces is this: the wing line is built as `🪂 ${wing}`, so a null would
 * publish "🪂 null" onto a real activity. descriptionFooter.ts records two
 * earlier occasions when a description writer corrupted live activities and did
 * not self-heal, which is why these tests exist before the column was relaxed
 * rather than after something went wrong.
 */

const PREFERENCES: DescriptionPreference = {
    pilot_id: 1,
    include_sites: true,
    include_wind: false,
    include_wing_aggregate: true,
    include_year_aggregate: true,
    include_all_time_aggregate: true,
}

function flight(wing: string | null): FlightRow {
    return {
        pilot_id: 1,
        strava_activity_id: '1',
        wing,
        duration_sec: 3600,
        distance_meters: 1000,
        start_date: new Date('2024-06-01T10:00:00Z'),
        description: '',
        polyline: [],
        takeoff_id: undefined,
        landing_id: undefined,
    } as unknown as FlightRow
}

function preview(wing: string | null): string {
    return new DescriptionFormatterClient(flight(wing), PREFERENCES)
        .generatePreview({ takeoff_name: 'Planfait', landing_name: 'Doussard' })
}

describe('hasWingName', () => {
    it('rejects the values a missing wing actually arrives as', () => {
        expect(hasWingName(null)).toBe(false)
        expect(hasWingName(undefined)).toBe(false)
        expect(hasWingName('')).toBe(false)
        expect(hasWingName('   ')).toBe(false)
    })

    it('accepts a real name', () => {
        expect(hasWingName('Ozone Zeno 2')).toBe(true)
    })
})

describe('the wing line, with a wing', () => {
    /**
     * Unchanged from before wings became rows, character for character. Every
     * existing flight has a wing, so this is what the overwhelming majority of
     * descriptions still render as -- if this drifts, live activities get
     * rewritten for no reason.
     */
    it('is written exactly as it was', () => {
        expect(preview('Ozone Zeno 2')).toBe(
            [
                '↗️ Planfait',
                '↘️ Doussard',
                '🪂 Ozone Zeno 2    15 flights / 18h 45min',
                '2024               42 flights / 52h 30min',
                'All Time           87 flights / 124h 15min',
                '🌐 ploufbag.com/a45nz',
            ].join('\n')
        )
    })
})

describe('the wing line, without a wing', () => {
    it.each([
        ['null', null],
        ['empty', ''],
        ['whitespace', '   '],
    ])('never writes the wing prefix when the wing is %s', (_label, wing) => {
        const output = preview(wing)
        expect(output).not.toContain('🪂')
        expect(output).not.toContain('null')
        expect(output).not.toContain('undefined')
    })

    it('drops the line rather than leaving a bare glyph or a blank row', () => {
        expect(preview(null)).toBe(
            [
                '↗️ Planfait',
                '↘️ Doussard',
                '2024        42 flights / 52h 30min',
                'All Time    87 flights / 124h 15min',
                '🌐 ploufbag.com/a45nz',
            ].join('\n')
        )
    })

    it('still writes everything that does not depend on the wing', () => {
        const output = preview(null)
        expect(output).toContain('↗️ Planfait')
        expect(output).toContain('All Time')
        expect(output).toContain('🌐 ploufbag.com')
    })
})
