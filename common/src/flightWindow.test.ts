import { describe, expect, it } from 'vitest'
import {
    DEFAULT_FLIGHT_WINDOW_OPTIONS,
    findFlightWindow,
    trimmedSeconds,
    type TrackSample,
} from './flightWindow'

/**
 * Tracks are built rather than fixtured, so a case reads as what a pilot did:
 * "twelve minutes of walking, then eight minutes of flying, then five more of
 * walking" is a sentence you can check the assertion against.
 */

/** Metres of latitude, near enough for a test: 1 degree is about 111 km. */
const METRES = 1 / 111_000

type Leg = {
    /** How long this leg lasts. */
    seconds: number
    /** Ground speed, km/h. */
    speedKmh: number
    /** Vertical rate, m/s. Negative is descending. */
    verticalMs?: number
}

function track(legs: Leg[], sampleEverySec: number = 5): TrackSample[] {
    const samples: TrackSample[] = []
    let timeSec = 0
    let lat = 45.9
    let altitude = 2000

    for (const leg of legs) {
        const metresPerSec = (leg.speedKmh * 1000) / 3600
        for (let elapsed = 0; elapsed < leg.seconds; elapsed += sampleEverySec) {
            samples.push({ timeSec, point: [lat, 6.85], altitudeMetres: altitude })
            lat += metresPerSec * sampleEverySec * METRES
            altitude += (leg.verticalMs ?? 0) * sampleEverySec
            timeSec += sampleEverySec
        }
    }
    // The closing sample, so the last leg has an end as well as a start.
    samples.push({ timeSec, point: [lat, 6.85], altitudeMetres: altitude })
    return samples
}

const FAFF_AT_LAUNCH: Leg = { seconds: 12 * 60, speedKmh: 3, verticalMs: 0 }
const SLED_RIDE: Leg = { seconds: 5 * 60, speedKmh: 38, verticalMs: -3 }
const PACKING_UP: Leg = { seconds: 6 * 60, speedKmh: 2.5, verticalMs: 0 }

describe('finding the flight in a recording', () => {
    it('cuts the walking off both ends of an uncropped flight', () => {
        const window = findFlightWindow(track([FAFF_AT_LAUNCH, SLED_RIDE, PACKING_UP]))

        expect(window).not.toBeNull()
        expect(window!.durationSec).toBeGreaterThanOrEqual(4 * 60)
        expect(window!.durationSec).toBeLessThanOrEqual(6 * 60)
        expect(window!.trimmedLeadingSec).toBeGreaterThanOrEqual(11 * 60)
        expect(window!.trimmedTrailingSec).toBeGreaterThanOrEqual(5 * 60)
    })

    it('leaves an already cropped flight almost exactly alone', () => {
        const window = findFlightWindow(track([SLED_RIDE]))

        expect(window).not.toBeNull()
        expect(trimmedSeconds(window!)).toBeLessThanOrEqual(30)
    })

    it('keeps a ridge soaring beat that barely moves over the ground', () => {
        // Into 30 km/h of wind the ground speed collapses; the climb is what
        // says this is still flying. Ungated, this is the case that would have
        // the detector cut the middle out of a coastal flight.
        const soaring: Leg[] = [
            { seconds: 90, speedKmh: 35, verticalMs: -1 },
            { seconds: 240, speedKmh: 4, verticalMs: 1.4 },
            { seconds: 90, speedKmh: 35, verticalMs: -1 },
        ]
        const window = findFlightWindow(track(soaring))

        expect(window).not.toBeNull()
        expect(window!.durationSec).toBeGreaterThanOrEqual(400)
    })

    it('does not split a flight around a quiet thermal', () => {
        const thermalling: Leg[] = [
            { seconds: 120, speedKmh: 30, verticalMs: -1 },
            // Parked in smooth lift: slow over the ground, climbing gently.
            { seconds: 60, speedKmh: 5, verticalMs: 0.4 },
            { seconds: 120, speedKmh: 30, verticalMs: -1 },
        ]
        const window = findFlightWindow(track(thermalling))

        expect(window).not.toBeNull()
        expect(window!.durationSec).toBeGreaterThanOrEqual(280)
    })

    it('finds the flight in a hike and fly, where the walk is most of the day', () => {
        const hikeAndFly: Leg[] = [
            { seconds: 90 * 60, speedKmh: 4, verticalMs: 0.25 },
            { seconds: 11 * 60, speedKmh: 34, verticalMs: -2 },
        ]
        const window = findFlightWindow(track(hikeAndFly))

        expect(window).not.toBeNull()
        expect(window!.durationSec).toBeGreaterThanOrEqual(10 * 60)
        expect(window!.durationSec).toBeLessThanOrEqual(12 * 60)
        expect(window!.trimmedLeadingSec).toBeGreaterThanOrEqual(85 * 60)
    })
})

describe('declining to trim', () => {
    it('returns null for a walk, rather than inventing a flight in it', () => {
        expect(findFlightWindow(track([{ seconds: 40 * 60, speedKmh: 4 }]))).toBeNull()
    })

    it('returns null for a recording too short to say anything about', () => {
        expect(findFlightWindow(track([{ seconds: 30, speedKmh: 38, verticalMs: -3 }]))).toBeNull()
    })

    it('returns null rather than trim a track with no times worth the name', () => {
        expect(findFlightWindow([])).toBeNull()
        expect(findFlightWindow([{ timeSec: 0, point: [45.9, 6.85] }])).toBeNull()
    })

    it('declines when what it found is a small piece of where the pilot went', () => {
        // A drive to the landing field with a two minute walk in the middle:
        // the window would be a fraction of the distance, and a fraction is not
        // a flight worth publishing a number about.
        const drive: Leg[] = [
            { seconds: 10 * 60, speedKmh: 70 },
            { seconds: 2 * 60, speedKmh: 4 },
            { seconds: 10 * 60, speedKmh: 70 },
        ]
        const window = findFlightWindow(drive.length ? track(drive) : [], {
            ...DEFAULT_FLIGHT_WINDOW_OPTIONS,
            // Pretend driving is not flying, which is the type gate's job in
            // real life; what is under test here is the distance backstop.
            flyingSpeedKmh: 80,
        })
        expect(window).toBeNull()
    })
})

describe('working without altitude', () => {
    it('still finds the flight from ground speed alone', () => {
        const samples = track([FAFF_AT_LAUNCH, SLED_RIDE, PACKING_UP])
            .map(sample => ({ ...sample, altitudeMetres: null }))
        const window = findFlightWindow(samples)

        expect(window).not.toBeNull()
        expect(window!.durationSec).toBeGreaterThanOrEqual(4 * 60)
        expect(window!.trimmedLeadingSec).toBeGreaterThanOrEqual(11 * 60)
    })
})
