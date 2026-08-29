import { describe, expect, it, vi } from 'vitest'
import { TrackSample, success } from '@ploufbag/common'
import { looksPadded, shapeOfActivity } from './flightShape'
import { StravaActivity } from '@/stravaApi/model'

/**
 * The bridge between Strava and the flight window: which activities are worth a
 * third request, and what comes back for the ones that are.
 *
 * The detector itself is argued against tracks in common/src/flightWindow.test.ts.
 * What matters here is that an activity nobody needs to trim never costs a
 * request, and that everything downstream still works when Strava says no.
 */

function activity(overrides: Partial<StravaActivity> = {}): StravaActivity {
    return {
        id: '19945852265',
        name: 'Paraglide • Planpraz',
        description: '🪂 Ronin12',
        type: 'Kitesurf',
        distance: 3_313,
        moving_time: 281,
        elapsed_time: 281,
        total_elevation_gain: 2.2,
        start_date: new Date('2026-08-29T09:05:09Z'),
        start_latlng: [45.93, 6.85],
        end_latlng: [45.92, 6.87],
        map: { polyline: 'ohnnGqfeb@??' },
        ...overrides,
    } as StravaActivity
}

/** A track: a quarter of an hour of walking, then five minutes of flying. */
function faffThenFlight(): TrackSample[] {
    const samples: TrackSample[] = []
    let lat = 45.93
    let altitude = 2_000
    const step = (speedKmh: number, verticalMs: number, seconds: number, from: number) => {
        for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
            samples.push({ timeSec: from + elapsed, point: [lat, 6.85], altitudeMetres: altitude })
            lat += ((speedKmh * 1000) / 3600) * 5 * (1 / 111_000)
            altitude += verticalMs * 5
        }
    }
    step(3, 0, 15 * 60, 0)
    step(38, -3, 5 * 60, 15 * 60)
    samples.push({ timeSec: 20 * 60, point: [lat, 6.85], altitudeMetres: altitude })
    return samples
}

function apiWith(streams: TrackSample[] | Error) {
    const fetchActivityStreams = vi.fn(async () =>
        streams instanceof Error ? [null, streams.message] : success(streams)
    )
    return { api: { fetchActivityStreams } as any, fetchActivityStreams }
}

describe('deciding whether an activity is worth measuring', () => {
    it('leaves a tidy flight alone rather than spend a request on it', () => {
        expect(looksPadded(activity())).toBe(false)
    })

    it('measures one whose clock says the pilot stopped', () => {
        expect(looksPadded(activity({ elapsed_time: 2_400, moving_time: 1_700 }))).toBe(true)
    })

    it('measures one averaging slower than anything flies', () => {
        expect(looksPadded(activity({ elapsed_time: 2_400, moving_time: 2_400 }))).toBe(true)
    })
})

describe('shaping an activity into a flight', () => {
    it('does not go to Strava for an activity that needs no trimming', async () => {
        const { api, fetchActivityStreams } = apiWith([])

        const shape = await shapeOfActivity(api, activity())

        expect(fetchActivityStreams).not.toHaveBeenCalled()
        expect(shape.flown).toBeNull()
        expect(shape.durationSec).toBe(281)
    })

    it('reports the flight, not the recording, once it has the timestamps', async () => {
        const { api } = apiWith(faffThenFlight())

        const shape = await shapeOfActivity(
            api,
            activity({ elapsed_time: 20 * 60, moving_time: 6 * 60, distance: 4_000 })
        )

        expect(shape.durationSec).toBeGreaterThanOrEqual(4 * 60)
        expect(shape.durationSec).toBeLessThanOrEqual(6 * 60)
        expect(shape.flown?.trimmedSec).toBeGreaterThanOrEqual(14 * 60)
        // Takeoff, rather than when the pilot pressed record.
        expect(shape.startDate.toISOString()).toBe('2026-08-29T09:20:09.000Z')
    })

    it('falls back to the recording when Strava has no streams to give', async () => {
        const { api } = apiWith([])

        const shape = await shapeOfActivity(
            api,
            activity({ elapsed_time: 20 * 60, moving_time: 6 * 60 })
        )

        expect(shape.flown).toBeNull()
        expect(shape.durationSec).toBe(20 * 60)
        expect(shape.rateLimited).toBe(false)
    })

    it('passes a rate limit up so a batch can stop, and stays usable', async () => {
        const { api } = apiWith(new Error('Rate limited'))

        const shape = await shapeOfActivity(
            api,
            activity({ elapsed_time: 20 * 60, moving_time: 6 * 60 })
        )

        expect(shape.rateLimited).toBe(true)
        expect(shape.flown).toBeNull()
        expect(shape.durationSec).toBe(20 * 60)
    })
})
