import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Flights, Wings, isSuccess, withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'
import { end } from '@/database/client'

/**
 * A pilot buys a glider, writes its name on the activity, and imports it.
 *
 * That is all it should take, and for a while it was not enough. Promotion read
 * the 🪂 line correctly, looked for a matching row in `wings`, found none --
 * because the pilot had never opened the wings screen, or because the backfill
 * that would have created one had never been applied to production -- and threw
 * the name away. The flight imported unattributed, the site rendered "Unknown
 * wing", and the stats block published back to Strava had no 🪂 line at all
 * because DescriptionFormatter omits it rather than writing a blank one.
 *
 * The pilot's own word for their own glider was in the text the whole time.
 */

vi.mock('./updateDescription', () => ({
    executeUpdateDescriptionTask: vi.fn(async () => ({ success: true })),
}))

const { promotePilotFlights } = await import('./promoteFlights')
const { scanPilotActivities } = await import('./scanActivities')

const PILOT = 4142500

/**
 * Newest first, because that is the order promotion works in -- so the activity
 * naming no wing is promoted last, by which time two gliders exist and no date
 * rule can pick between them. It has to come out unattributed, which is a legal
 * state and the one thing this must not paper over by guessing.
 */
const ACTIVITIES = [
    { id: 'susi-capital', start: '2026-09-05T09:05:09Z', description: '🪂 Susi' },
    // The same glider, spelled the way a pilot actually types it twice.
    { id: 'susi-lower', start: '2026-09-04T10:43:39Z', description: '🪂 susi' },
    { id: 'ronin', start: '2026-09-03T11:24:00Z', description: '🪂 Ronin12' },
    { id: 'nameless', start: '2026-09-02T11:24:00Z', description: 'Evening at Planpraz' },
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
    fetchActivitySummaries: async () => [ACTIVITIES.map(summary), undefined],
    fetchActivity: async (id: string) => {
        const found = ACTIVITIES.find(activity => activity.id === id)
        if (!found) return [undefined, `no such activity ${id}`]
        return [{
            ...summary(found),
            description: found.description,
            map: { polyline: 'ohnnGqfeb@fAoB' },
        }, undefined]
    },
    fetchActivityStreams: async () => [[], undefined],
    updateDescription: async () => [undefined, 'no token in this harness'],
} as any

describe('promoting a flight that names a glider we have never heard of', () => {
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

        // The state this is about: no wings at all, which is what production
        // had, because backfill_wings was excluded from the manifest and never
        // applied there.
        const before = await Wings.getForPilot(PILOT)
        expect(isSuccess(before) && before[0]).toEqual([])
    }, 120_000)

    afterAll(async () => {
        await end()
        await container?.stop()
    }, 60_000)

    it('creates the wing and attributes the flight to it', async () => {
        const promotion = await promotePilotFlights(PILOT, stravaApi)

        expect(promotion.error).toBeUndefined()
        expect(promotion.summary!.promoted).toBe(ACTIVITIES.length)
        // Two gliders across three named activities: "Susi" and "susi" are one
        // wing, folded by wing_key exactly as the unique index folds it.
        expect(promotion.summary!.wingsCreated).toBe(2)

        const wings = await Wings.getForPilot(PILOT)
        expect(isSuccess(wings)).toBe(true)
        expect(wings[0]!.map(wing => wing.name).sort()).toEqual(['Ronin12', 'Susi'])
    }, 90_000)

    it('puts the name on the flight, which is what the site and Strava read', async () => {
        const flights = await Flights.getAll(PILOT)
        expect(isSuccess(flights)).toBe(true)

        const byId = new Map(flights[0]!.map(flight => [flight.strava_activity_id, flight]))

        // The bug, stated as an assertion: this used to be null on all three.
        expect(byId.get('susi-capital')!.wing).toBe('Susi')
        expect(byId.get('susi-lower')!.wing).toBe('Susi')
        expect(byId.get('ronin')!.wing).toBe('Ronin12')

        // And the link, not only the text -- the map takes its colour from it.
        expect(byId.get('susi-capital')!.wing_id).toBeTruthy()
        expect(byId.get('susi-capital')!.wing_id).toBe(byId.get('susi-lower')!.wing_id)
    }, 90_000)

    it('still leaves a flight that names nothing unattributed rather than guessing', async () => {
        // Two wings and no dates on either, so no rule can choose. An
        // unattributed flight is a flight; inventing an attribution here would
        // publish a wing the pilot never claimed onto their Strava activity.
        const flights = await Flights.getAll(PILOT)
        const nameless = flights[0]!.find(flight => flight.strava_activity_id === 'nameless')!

        expect(nameless.wing).toBeNull()
        expect(nameless.wing_id).toBeNull()
    }, 90_000)

    it('creates no second wing when the same glider is named again', async () => {
        // A re-run finds nothing to promote, so nothing to create. The
        // interesting half is the unique index: ensureNamed defers to it, so
        // even a concurrent webhook naming "Susi" cannot produce a duplicate.
        const again = await promotePilotFlights(PILOT, stravaApi)

        expect(again.summary!.promoted).toBe(0)
        expect(again.summary!.wingsCreated).toBe(0)

        const wings = await Wings.getForPilot(PILOT)
        expect(wings[0]!.length).toBe(2)
    }, 90_000)
})
