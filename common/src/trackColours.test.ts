import { describe, expect, it } from 'vitest'
import { TRACK_COLOURS, flightTrackColour, trackColourFor } from './trackColours'

describe('trackColourFor', () => {
    it('always returns a colour from the palette', () => {
        for (const key of ['', 'a', '12345Zeno 2', '🪂', 'Ozone Rush 5', 'é']) {
            expect(TRACK_COLOURS).toContain(trackColourFor(key))
        }
    })

    it('is stable for a given key', () => {
        expect(trackColourFor('12345Zeno 2')).toBe(trackColourFor('12345Zeno 2'))
    })

    /**
     * Golden values, captured from the implementation as it stood when it lived
     * in the site's map code. If one of these changes, every flight already on
     * the map changes colour and every wing row the backfill wrote is now wrong
     * -- so this failing is a migration, not a test to update.
     */
    it('matches the colours existing flights are already drawn in', () => {
        expect(trackColourFor('')).toBe('#3b82f6')
        expect(trackColourFor('a')).toBe('#84cc16')
        expect(trackColourFor('12345Zeno 2')).toBe('#ec4899')
        expect(trackColourFor('12345unknown')).toBe('#6366f1')
        expect(trackColourFor('987Ozone Rush 5')).toBe('#22c55e')
    })

    it('distinguishes case and whitespace, which is why wings had to be merged', () => {
        expect(trackColourFor('1Zeno 2')).not.toBe(trackColourFor('1zeno 2'))
    })
})

describe('flightTrackColour', () => {
    it('treats a missing wing as the literal "unknown" the callers already passed', () => {
        expect(flightTrackColour(12345, null)).toBe(trackColourFor('12345unknown'))
        expect(flightTrackColour(12345, undefined)).toBe(trackColourFor('12345unknown'))
        expect(flightTrackColour(12345, '')).toBe(trackColourFor('12345unknown'))
    })

    it('accepts the pilot id as either a number or the string the map passes', () => {
        expect(flightTrackColour(12345, 'Zeno 2')).toBe(flightTrackColour('12345', 'Zeno 2'))
    })
})
