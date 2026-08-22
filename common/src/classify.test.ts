import { describe, expect, it } from 'vitest'
import {
    CONFIDENT_SCORE,
    classifyActivity,
    effectiveVerdict,
    haversineMetres,
    type ClassifierInput,
} from './classify'

/**
 * The classifier, against cases that look like real Strava accounts.
 *
 * These are the arguments the thresholds have to survive. When a threshold
 * moves, this file is where the consequence shows up -- which is the whole
 * reason the classifier is a pure function over a summary rather than something
 * that needs a database to have an opinion.
 */

function activity(overrides: Partial<ClassifierInput> = {}): ClassifierInput {
    return {
        type: 'Workout',
        name: 'Afternoon Workout',
        distanceMeters: 12_000,
        elapsedSec: 45 * 60,
        totalElevationGain: 300,
        startPoint: [45.8, 6.2],
        endPoint: [45.86, 6.22],
        hasTrack: true,
        takeoffSiteName: null,
        landingSiteName: null,
        wingFromDescription: null,
        candidateTypes: ['Workout'],
        ...overrides,
    }
}

describe('the type gate', () => {
    it('rejects a type this pilot does not log flights as, and says which', () => {
        const result = classifyActivity(activity({ type: 'Ride' }))
        expect(result.verdict).toBe('not_flight')
        expect(result.reasons[0].text).toBe('Logged as Ride')
    })

    it('accepts a type the pilot has told us about', () => {
        const result = classifyActivity(activity({
            type: 'Hike',
            candidateTypes: ['Hike'],
            takeoffSiteName: 'Planfait',
            landingSiteName: 'Doussard',
        }))
        expect(result.verdict).toBe('flight')
    })

    /** The bug that made a whole class of pilots invisible. */
    it('falls back to the two types the old importer hard-coded', () => {
        const result = classifyActivity(activity({ type: 'Kitesurf', candidateTypes: [] }))
        expect(result.reasons.some(r => r.code === 'type')).toBe(false)
    })
})

describe('confident flights', () => {
    it('takes a takeoff and a landing as near proof', () => {
        const result = classifyActivity(activity({
            takeoffSiteName: 'Planfait',
            landingSiteName: 'Doussard',
        }))
        expect(result.verdict).toBe('flight')
        expect(result.score).toBeGreaterThanOrEqual(CONFIDENT_SCORE)
        expect(result.reasons[0].text).toBe('Planfait → Doussard')
    })

    it('trusts a wing the pilot wrote themselves, even with nothing else going for it', () => {
        const result = classifyActivity(activity({
            wingFromDescription: 'Ozone Zeno 2',
            hasTrack: false,
            startPoint: null,
            endPoint: null,
        }))
        expect(result.verdict).toBe('flight')
    })

    it('explains itself in words a pilot recognises, strongest first', () => {
        const result = classifyActivity(activity({
            takeoffSiteName: 'Forclaz',
            landingSiteName: 'Doussard',
        }))
        expect(result.reasons[0].text).toContain('→')
        expect(result.reasons.every(reason => !reason.text.includes('%'))).toBe(true)
    })
})

describe('things that are not flights', () => {
    it('rejects a gym session logged as a Workout', () => {
        const result = classifyActivity(activity({
            name: 'Gym',
            distanceMeters: 0,
            elapsedSec: 50 * 60,
            hasTrack: false,
            startPoint: null,
            endPoint: null,
            totalElevationGain: 0,
        }))
        expect(result.verdict).toBe('not_flight')
    })

    it('rejects a walk: slow, climbing, and back where it started', () => {
        const result = classifyActivity(activity({
            name: 'Morning Workout',
            distanceMeters: 8_000,
            elapsedSec: 2 * 3600,
            totalElevationGain: 1_100,
            startPoint: [45.8, 6.2],
            endPoint: [45.8001, 6.2001],
        }))
        expect(result.verdict).toBe('not_flight')
    })

    it('rejects a false start of a few seconds', () => {
        const result = classifyActivity(activity({
            distanceMeters: 40,
            elapsedSec: 30,
            totalElevationGain: 0,
        }))
        expect(result.verdict).toBe('not_flight')
    })
})

describe('the cases that should be asked about, not guessed', () => {
    /**
     * The failure mode flagged in the build plan. A pilot who walks up and flies
     * down, recorded as one activity, has every geometric signal disagreeing
     * with every other: it climbs like a hike and descends like a flight.
     * Landing in the unsure pile is the correct outcome, not a bug.
     */
    it('does not confidently claim a hike-and-fly recorded as one activity', () => {
        const result = classifyActivity(activity({
            name: 'Marché et vol',
            distanceMeters: 14_000,
            elapsedSec: 3 * 3600,
            totalElevationGain: 1_050,
            takeoffSiteName: 'Planfait',
            landingSiteName: null,
        }))
        expect(result.verdict).not.toBe('flight')
    })

    it('asks about a flight that landed away from any known site', () => {
        const result = classifyActivity(activity({
            name: 'Montmin, matin brumeux',
            takeoffSiteName: 'Forclaz',
            landingSiteName: null,
            distanceMeters: 4_100,
            elapsedSec: 26 * 60,
            totalElevationGain: 80,
        }))
        expect(result.verdict).toBe('unsure')
        // And the doubt is the thing shown to the pilot, because it is what
        // they can settle by looking at the track for a second.
        expect(result.reasons.some(r => r.code === 'open-landing')).toBe(true)
    })

    it('still accepts an ordinary outlanding that flew like a flight', () => {
        const result = classifyActivity(activity({
            name: 'Vol du soir',
            takeoffSiteName: 'Planfait',
            landingSiteName: null,
            distanceMeters: 14_200,
            elapsedSec: 42 * 60,
            totalElevationGain: 250,
        }))
        expect(result.verdict).toBe('flight')
    })
})

describe('effectiveVerdict', () => {
    it('lets the pilot overrule us', () => {
        expect(effectiveVerdict('not_flight', 'flight')).toBe('flight')
        expect(effectiveVerdict('flight', 'not_flight')).toBe('not_flight')
    })

    it('falls back to our own verdict when they have not said', () => {
        expect(effectiveVerdict('unsure', null)).toBe('unsure')
        expect(effectiveVerdict('unsure', undefined)).toBe('unsure')
    })
})

describe('haversineMetres', () => {
    it('is zero for the same point', () => {
        expect(haversineMetres([45.8, 6.2], [45.8, 6.2])).toBe(0)
    })

    it('measures a known short hop about right', () => {
        // Planfait to Doussard is roughly 4 km down the lake.
        const metres = haversineMetres([45.8306, 6.2011], [45.7938, 6.2178])
        expect(metres).toBeGreaterThan(3_000)
        expect(metres).toBeLessThan(5_500)
    })
})
