import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Flights, isSuccess, withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'
import { end } from '@/database/client'

/**
 * One activity we cannot describe must not take the batch down with it.
 *
 * A promotion does two things: store the flight, then publish stats onto the
 * Strava activity. The second half was written for a task that reports failure
 * by returning `{ success: false }`, and the loop handles that — logs it and
 * carries on. Nothing handled a task that *throws*.
 *
 * It threw. `flights.description` is nullable on any instance whose table
 * predates create_flights.sql, and `isFormattedDescription` called `.includes`
 * straight on it: `Cannot read properties of null (reading 'includes')`. That
 * came up through promotePilotFlights and out of executeFetchAllActivitiesTask,
 * so a sync of twenty flights imported the ones before the bad row, abandoned
 * every one after it, returned no summary, and gave the workflow a 500. The
 * pilot's answer to "did the backfill work?" was an HTTP status code.
 *
 * The null is guarded now and the column is being fixed, but neither is the
 * point here. Any throw from the description writer — a network stack, a bad
 * preferences row, the next unexpected null — has to cost one activity.
 */

vi.mock('./updateDescription', () => ({
    executeUpdateDescriptionTask: vi.fn(async ({ flightId }: { flightId: string }) => {
        if (flightId === EXPLODES) {
            // The real one, verbatim, so this stays honest about what happened.
            throw new TypeError("Cannot read properties of null (reading 'includes')")
        }
        return { success: true }
    }),
}))

const { promotePilotFlights } = await import('./promoteFlights')
const { scanPilotActivities } = await import('./scanActivities')

const PILOT = 4142500
const EXPLODES = '19947388568'

const FLIGHTS = [
    { id: '19945852265', start: '2026-08-29T09:05:09Z' },
    { id: EXPLODES, start: '2026-08-29T10:43:39Z' },
    { id: '19948005841', start: '2026-08-29T11:24:00Z' },
]

function summary(activity: { id: string; start: string }) {
    return {
        id: activity.id,
        name: 'Paraglide • Planpraz',
        type: 'Kitesurf',
        distance: 3312.7,
        moving_time: 281,
        elapsed_time: 281,
        total_elevation_gain: 2.2,
        start_date: new Date(activity.start),
        start_latlng: [45.9047, 6.8831] as [number, number],
        end_latlng: [45.92968, 6.87636] as [number, number],
        map: { summary_polyline: 'ohnnGqfeb@fAoB' },
    }
}

const stravaApi = {
    fetchActivitySummaries: async () => [FLIGHTS.map(summary), undefined],
    fetchActivity: async (id: string) => {
        const found = FLIGHTS.find(activity => activity.id === id)
        if (!found) return [undefined, `no such activity ${id}`]
        return [{ ...summary(found), description: '🪂 Ronin12', map: { polyline: 'ohnnGqfeb@fAoB' } }, undefined]
    },
    fetchActivityStreams: async () => [[], undefined],
    updateDescription: async () => [undefined, 'no token in this harness'],
} as any

describe('a promotion whose description write throws', () => {
    let container: StartedPostgreSqlContainer

    beforeAll(async () => {
        container = await TestContainer.generateEmpty()
        await withPooledClient(async client => {
            await client.query(
                `insert into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token)
                 values (${PILOT}, 'Theo', 'token', 'refresh')`
            )
        })
        const scan = await scanPilotActivities(PILOT, stravaApi)
        expect(scan.error).toBeUndefined()
    }, 120_000)

    afterAll(async () => {
        await end()
        await container?.stop()
    }, 60_000)

    it('keeps the flight, promotes the rest, and still reports a summary', async () => {
        const promotion = await promotePilotFlights(PILOT, stravaApi)

        // The whole point: it returns rather than propagating.
        expect(promotion.error).toBeUndefined()
        expect(promotion.summary).toBeDefined()
        expect(promotion.summary!.promoted).toBe(FLIGHTS.length)
        expect(promotion.summary!.remaining).toBe(0)

        // Including the one we could not describe. The flight is stored; only
        // its Strava description is missing, and the next run writes that.
        const flights = await Flights.getAll(PILOT)
        expect(isSuccess(flights)).toBe(true)
        expect(flights[0]!.map(flight => flight.strava_activity_id).sort())
            .toEqual(FLIGHTS.map(activity => activity.id).sort())
    }, 90_000)
})
