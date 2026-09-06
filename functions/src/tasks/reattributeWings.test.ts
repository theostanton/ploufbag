import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { DESCRIPTION_DOMAIN, withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'
import { end } from '@/database/client'

/**
 * Giving a wing back to a flight whose description always named one.
 *
 * Seventeen consecutive flights on a real account imported unattributed while
 * their descriptions read "🪂 Susi", because the resolver could only match names
 * it already had a row for and `wings` was empty in production. The site said
 * "Unknown wing" and the stats block we published carried no 🪂 line.
 *
 * What is pinned here is the accounting as much as the repair, for the reason
 * #44 exists: a pass that reports the same numbers whether it is working
 * through a backlog or re-reading one page is worse than no numbers. So a wing
 * created and a wing found are counted apart, and `remaining` is a count of the
 * work left rather than the size of the last page.
 */

const PILOT = 4142500
const NEW_WING = 'susi-new'
const SAME_WING = 'susi-again'
const PADDED = 'padded-ronin'
const UNNAMED = 'names-nothing'
const ATTRIBUTED = 'already-has-one'

vi.mock('./updateDescription', () => ({
    executeUpdateDescriptionTask: vi.fn(async ({ flightId }: { flightId: string }) => {
        await withPooledClient(client => client.query(
            `update flights set description = $1 where strava_activity_id = $2`,
            [`↗️ Planpraz\n🌐 ${DESCRIPTION_DOMAIN}/sis4g`, flightId]
        ))
        return { success: true, summary: { published: true } }
    }),
}))

const { reattributeNamedWings } = await import('./reattributeWings')

describe('reattributing wings from descriptions', () => {
    let container: StartedPostgreSqlContainer

    beforeAll(async () => {
        container = await TestContainer.generateEmpty()
        await withPooledClient(async client => {
            await client.query(
                `insert into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token)
                 values (${PILOT}, 'Theo', 'token', 'refresh')`
            )
            const rows: Array<[string, string | null, string, Date]> = [
                // The shape that started this: the pilot's own line above the
                // block we published without a wing on it.
                [NEW_WING, null, '🪂 Susi\n↗️ Planpraz\nAll Time    318 flights / 96h 5min',
                    new Date('2026-09-05T10:00:00Z')],
                // Same glider, spelled differently, and carrying the aggregate
                // columns we write onto that line once we know it.
                [SAME_WING, null, '🪂 susi        70 flights / 96h 5min',
                    new Date('2026-09-04T10:00:00Z')],
                // Trailing padding, as captured from a stats column.
                [PADDED, null, '🪂 Ronin      ', new Date('2026-09-03T10:00:00Z')],
                // No 🪂 line: not repairable from its description, and the query
                // must not offer it -- a row offered and declined every round is
                // a backlog that never goes down.
                [UNNAMED, null, 'Evening at Planpraz', new Date('2026-09-02T10:00:00Z')],
                // Already attributed. Not this pass's business.
                [ATTRIBUTED, 'Vivo', '🪂 Vivo', new Date('2026-09-01T10:00:00Z')],
            ]
            for (const [id, wing, description, startDate] of rows) {
                await client.query(
                    `insert into flights (pilot_id, strava_activity_id, wing, duration_sec,
                                          distance_meters, start_date, description, polyline)
                     values ($1, $2, $3, 281, 3312, $4, $5, null)`,
                    [PILOT, id, wing, startDate, description]
                )
            }
        })
    }, 120_000)

    afterAll(async () => {
        await end()
        await container?.stop()
    }, 60_000)

    it('creates the wings a description names and attributes the flights to them', async () => {
        const result = await reattributeNamedWings(PILOT)

        expect(result.error).toBeUndefined()
        const summary = result.summary!

        // Three flights named a wing and had none.
        expect(summary.attributed).toBe(3)
        // Two gliders, not three: "Susi" and "susi" are one wing, which is what
        // wing_key is for and what ensureNamed has to honour.
        expect(summary.created).toBe(2)
        // Nothing was offered that could not be read. This is the number that
        // says the pass is stuck rather than slow, and it has to be zero.
        expect(summary.skipped).toBe(0)
        expect(summary.failed).toBe(0)
        // Each repair rewrites the block, which was missing its 🪂 line.
        expect(summary.republished).toBe(3)
        // A true count. The flight naming nothing was never in the list.
        expect(summary.remaining).toBe(0)
    }, 90_000)

    it('stores one wing per glider, spelled as the pilot spelled it', async () => {
        const wings = await withPooledClient(client => client.query<{ name: string; colour: string }>(
            `select name, colour from wings where pilot_id = $1 order by lower(name)`,
            [PILOT]
        ))
        const rows = wings.rows.map(row => row.reify())

        expect(rows.map(row => row.name)).toEqual(['Ronin', 'Susi'])
        // The padding is gone, not carried into the row it names.
        expect(rows.every(row => row.name === row.name.trim())).toBe(true)
        // Every wing is drawable. `colour` is not null for a reason.
        expect(rows.every(row => /^#[0-9a-f]{6}$/i.test(row.colour))).toBe(true)
    }, 30_000)

    it('puts the wing on the flight as text and as a link, both', async () => {
        const flights = await withPooledClient(client => client.query<{
            strava_activity_id: string; wing: string | null; wing_id: string | null
        }>(
            `select strava_activity_id, wing, wing_id from flights where pilot_id = $1`,
            [PILOT]
        ))
        const byId = new Map(flights.rows.map(row => {
            const flight = row.reify()
            return [flight.strava_activity_id, flight]
        }))

        // flights.wing is what gets published to Strava and what the per-wing
        // pages route on; wing_id is what the map takes its colour from. A
        // repair that set one and not the other is half a repair.
        for (const id of [NEW_WING, SAME_WING]) {
            expect(byId.get(id)!.wing).toBe('Susi')
            expect(byId.get(id)!.wing_id).not.toBeNull()
        }
        expect(byId.get(NEW_WING)!.wing_id).toBe(byId.get(SAME_WING)!.wing_id)
        expect(byId.get(PADDED)!.wing).toBe('Ronin')

        // Untouched: one had nothing to say, the other already had an answer.
        expect(byId.get(UNNAMED)!.wing).toBeNull()
        expect(byId.get(ATTRIBUTED)!.wing).toBe('Vivo')
    }, 30_000)

    it('finds no work the second time, and creates no second wing', async () => {
        const result = await reattributeNamedWings(PILOT)

        expect(result.summary!.attributed).toBe(0)
        expect(result.summary!.created).toBe(0)
        expect(result.summary!.skipped).toBe(0)
        expect(result.summary!.remaining).toBe(0)

        const wings = await withPooledClient(client => client.query<{ n: number }>(
            `select count(1)::int as n from wings where pilot_id = $1`, [PILOT]
        ))
        expect(wings.rows[0].reify().n).toBe(2)
    }, 90_000)

    it('stops on the deadline without leaving a flight half repaired', async () => {
        await withPooledClient(client => client.query(
            `update flights set wing = null, wing_id = null, description = '🪂 Susi'
             where strava_activity_id = $1`, [NEW_WING]
        ))

        // Already past, so the loop stops before touching anything.
        const result = await reattributeNamedWings(PILOT, 40, Date.now() - 1)

        expect(result.summary!.timedOut).toBe(true)
        expect(result.summary!.attributed).toBe(0)
        // And says so: the work is still there for the next round.
        expect(result.summary!.remaining).toBe(1)
    }, 90_000)
})
