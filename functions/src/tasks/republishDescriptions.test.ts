import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { DESCRIPTION_DOMAIN, withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'
import { end } from '@/database/client'

/**
 * What the republish pass reports, which is the part that misled a human.
 *
 * Two consecutive runs against a real account each reported `republished: 40,
 * remaining: 40`, and neither number meant what it looked like. `republished`
 * counted calls that returned success -- and the description writer returns
 * success when it has nothing to publish, so a flight declining to change
 * counted the same as one written to Strava. `remaining` was the length of
 * another capped page, so it could never exceed the batch and reported forty
 * whether forty were left or four hundred.
 *
 * Between them there was no number that could tell a pass working through a
 * backlog from one re-reading the same page for ever. This pins all three
 * outcomes apart.
 */

const PILOT = 4142500
const WRITTEN = 'written'
const NOTHING = 'nothing-to-say'
const BROKEN = 'throws'

vi.mock('./updateDescription', () => ({
    executeUpdateDescriptionTask: vi.fn(async ({ flightId }: { flightId: string }) => {
        if (flightId === BROKEN) throw new TypeError('something unexpected')
        if (flightId === NOTHING) {
            // The shape that used to be counted as a publish.
            return { success: true, summary: { published: false, reason: 'unchanged' } }
        }
        // A real write: mirror it into the row, as the writer does.
        await withPooledClient(client => client.query(
            `update flights set description = $1 where strava_activity_id = $2`,
            [`↗️ Planpraz\n🌐 ${DESCRIPTION_DOMAIN}/sis4g`, flightId]
        ))
        return { success: true, summary: { published: true } }
    }),
}))

const { republishMissingDescriptions } = await import('./republishDescriptions')

describe('republishing descriptions', () => {
    let container: StartedPostgreSqlContainer

    beforeAll(async () => {
        container = await TestContainer.generateEmpty()
        await withPooledClient(async client => {
            await client.query(
                `insert into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token)
                 values (${PILOT}, 'Theo', 'token', 'refresh')`
            )
            const rows: Array<[string, string, Date]> = [
                [WRITTEN, '🪂 Ronin12', new Date('2026-09-04T10:00:00Z')],
                [NOTHING, '🪂 Ronin12', new Date('2026-09-03T10:00:00Z')],
                [BROKEN, '🪂 Ronin12', new Date('2026-09-02T10:00:00Z')],
                ['already', `↗️ Planpraz\n🌐 ${DESCRIPTION_DOMAIN}/abcde`, new Date('2026-09-01T10:00:00Z')],
            ]
            for (const [id, description, startDate] of rows) {
                await client.query(
                    `insert into flights (pilot_id, strava_activity_id, wing, duration_sec,
                                          distance_meters, start_date, description, polyline)
                     values ($1, $2, null, 281, 3312, $3, $4, null)`,
                    [PILOT, id, startDate, description]
                )
            }
        })
    }, 120_000)

    afterAll(async () => {
        await end()
        await container?.stop()
    }, 60_000)

    it('counts writes, no-ops and failures apart, and reports the real backlog', async () => {
        const result = await republishMissingDescriptions(PILOT)

        expect(result.error).toBeUndefined()
        const summary = result.summary!

        // One flight actually reached Strava.
        expect(summary.republished).toBe(1)
        // One had nothing to publish. This is the one that used to inflate the
        // count above, and it is still bare, so it comes back next round.
        expect(summary.skipped).toBe(1)
        // One threw, and did not take the other two with it.
        expect(summary.failed).toBe(1)

        // The two still bare -- a true count, not a page length. The flight that
        // already carried a footer was never in the list.
        expect(summary.remaining).toBe(2)
    }, 90_000)

    it('does not offer a flight it has just described', async () => {
        const result = await republishMissingDescriptions(PILOT)

        // Nothing new to write: the one that could be written, was.
        expect(result.summary!.republished).toBe(0)
        expect(result.summary!.remaining).toBe(2)
    }, 90_000)
})
