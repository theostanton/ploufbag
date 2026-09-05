import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Activities, Flights, isSuccess, withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'
import { end } from '@/database/client'
import { scanPilotActivities } from './scanActivities'
import { promotePilotFlights } from './promoteFlights'

/**
 * The whole import path, over the eight activities that are actually missing.
 *
 * Not a unit test of the classifier -- that exists. This runs the real
 * scanPilotActivities and promotePilotFlights against a real Postgres with the
 * schema the deploy applies, with only the Strava HTTP calls stubbed, and asks
 * the question that matters: does clicking the button actually produce flights?
 *
 * It exists because I twice told a pilot to press something and it did nothing.
 */

const PILOT = 4142500

/** The eight, exactly as Strava's list endpoint returns them. */
const MISSING: Array<Record<string, any>> = [
    { id: '20042607829', description: '🪂 Ronin12', name: "Paraglide • Plan de l'Aiguille", type: 'Workout', distance: 3434.7, moving_time: 267, elapsed_time: 267, total_elevation_gain: 0, start_date: '2026-09-04T12:19:10Z' },
    { id: '20042600844', description: '🪂 Ronin12', name: 'Paraglide • La Flégère', type: 'Kitesurf', distance: 3794.1, moving_time: 381, elapsed_time: 381, total_elevation_gain: 2.8, start_date: '2026-09-04T09:53:40Z' },
    { id: '20042594085', description: '🪂 Ronin12', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 2814.9, moving_time: 239, elapsed_time: 239, total_elevation_gain: 5.5, start_date: '2026-09-04T07:51:32Z' },
    { id: '19961164246', description: '🪂 Ronin12', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 2748.5, moving_time: 229, elapsed_time: 229, total_elevation_gain: 0, start_date: '2026-08-30T10:43:06Z' },
    { id: '19948005841', description: '🪂 Ronin12', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 3151.1, moving_time: 240, elapsed_time: 240, total_elevation_gain: 5.8, start_date: '2026-08-29T11:24:00Z' },
    { id: '19947388568', description: '🪂 Ronin12', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 3724.6, moving_time: 243, elapsed_time: 261, total_elevation_gain: 21.4, start_date: '2026-08-29T10:43:39Z' },
    { id: '19946634022', description: '🪂 Ronin12', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 3039, moving_time: 255, elapsed_time: 255, total_elevation_gain: 5.4, start_date: '2026-08-29T10:00:40Z' },
    { id: '19945852265', description: '🪂 Ronin12\nNew wing day!', name: 'Paraglide • Planpraz', type: 'Kitesurf', distance: 3312.7, moving_time: 281, elapsed_time: 281, total_elevation_gain: 2.2, start_date: '2026-08-29T09:05:09Z' },
]

/** Things the pilot logs that are emphatically not flights. */
const NOT_FLIGHTS: Array<Record<string, any>> = [
    { id: '20033489414', name: 'Hike + fly • The Chamonix Triple', type: 'TrailRun', distance: 17557.7, moving_time: 14703, elapsed_time: 22870, total_elevation_gain: 3150, start_date: '2026-09-04T06:27:58Z', away: true, description: '🦶⬆️ 2026 = 37,864 m | 🌐 summitbag.com' },
    { id: '20015723828', name: 'Morning Walk', type: 'Walk', distance: 1442.2, moving_time: 1034, elapsed_time: 1034, total_elevation_gain: 0, start_date: '2026-09-03T06:21:27Z', away: true, description: '' },
    // 21 metres in 46 minutes: a vario left running, and not a flight by any
    // reading. Placed away from the sites here, where it scores -15. Sitting
    // inside a known launch and landing it would score 70 and import, which is
    // worth knowing before a backfill rather than after.
    { id: '18913987710', name: 'Test', type: 'Kitesurf', distance: 21.1, moving_time: 11, elapsed_time: 2757, total_elevation_gain: 0, start_date: '2026-06-14T08:52:33Z', away: true, description: '' },
]

function summary(activity: Record<string, any>) {
    return {
        ...activity,
        start_date: new Date(activity.start_date),
        // Planpraz to the Bois du Bouchet: the real launch and landing, so the
        // site lookup does what it does in production instead of matching
        // nothing. The not-flights below are put somewhere with no site near it.
        start_latlng: (activity.away ? [51.48, -0.16] : [45.9047, 6.8831]) as [number, number],
        end_latlng: (activity.away ? [51.47, -0.15] : [45.92968, 6.87636]) as [number, number],
        // A real two-point track: enough for hasTrack, decodes cleanly.
        map: { summary_polyline: 'ohnnGqfeb@fAoB' },
    }
}

/** Strava, minus the network. Detail calls carry the 🪂 line, as the real ones do. */
const stravaApi = {
    fetchActivitySummaries: async () =>
        [[...MISSING, ...NOT_FLIGHTS].map(summary), undefined],
    fetchActivity: async (id: string) => {
        const found = [...MISSING, ...NOT_FLIGHTS].find(activity => activity.id === id)
        if (!found) return [undefined, `no such activity ${id}`]
        // Each activity's own description. Handing the wing line to everything
        // makes the review pass promote a 21 metre "Test" and hides whether the
        // thing under test works.
        return [{ ...summary(found), description: found.description ?? '', map: { polyline: 'ohnnGqfeb@fAoB' } }, undefined]
    },
    fetchActivityStreams: async () => [[], undefined],
    updateDescription: async () => [undefined, 'no token in this harness'],
} as any

describe('the import path, end to end', () => {
    let container: StartedPostgreSqlContainer

    beforeAll(async () => {
        container = await TestContainer.generateEmpty()
        await withPooledClient(async client => {
            await client.query(
                `insert into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token)
                 values (${PILOT}, 'Theo', 'token', 'refresh')`
            )
        })
    }, 120_000)

    afterAll(async () => {
        await end()
        await container?.stop()
    }, 60_000)

    it('scans, recognises all eight, and rejects what is not a flight', async () => {
        const scan = await scanPilotActivities(PILOT, stravaApi)

        expect(scan.error).toBeUndefined()
        expect(scan.summary!.scanned).toBe(MISSING.length + NOT_FLIGHTS.length)

        const stored = await Activities.getForPilot(PILOT)
        expect(isSuccess(stored)).toBe(true)

        const verdicts = new Map(stored[0]!.map(row => [row.strava_activity_id, row.verdict]))
        for (const activity of MISSING) {
            expect(verdicts.get(activity.id), `${activity.id} ${activity.name}`).toBe('flight')
        }
        for (const activity of NOT_FLIGHTS) {
            expect(verdicts.get(activity.id), `${activity.id} ${activity.name}`).toBe('not_flight')
        }
    }, 60_000)

    it('promotes every recognised activity into a flight', async () => {
        const promotion = await promotePilotFlights(PILOT, stravaApi)

        expect(promotion.error).toBeUndefined()
        expect(promotion.summary!.promoted).toBe(MISSING.length)
        expect(promotion.summary!.demoted).toBe(0)

        const flights = await Flights.getAll(PILOT)
        expect(isSuccess(flights)).toBe(true)
        expect(flights[0]!.map(flight => flight.strava_activity_id).sort())
            .toEqual(MISSING.map(activity => activity.id).sort())
    }, 60_000)

    it('is idempotent: running it again promotes nothing and demotes nothing', async () => {
        const scan = await scanPilotActivities(PILOT, stravaApi)
        expect(scan.error).toBeUndefined()

        const promotion = await promotePilotFlights(PILOT, stravaApi)
        expect(promotion.summary!.promoted).toBe(0)
        expect(promotion.summary!.demoted).toBe(0)

        const flights = await Flights.getAll(PILOT)
        expect(flights[0]!).toHaveLength(MISSING.length)
    }, 90_000)
})
