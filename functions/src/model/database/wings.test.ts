import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {Client, connect} from "ts-postgres";
import * as fs from "node:fs";
import {TestContainer} from "./generateContainer.test";
import {Wings, isSuccess, trackColourFor} from "@ploufbag/common";

/**
 * The wings schema and its backfill.
 *
 * Two things here are worth a container rather than a unit test. track_colour()
 * is a reimplementation in PL/pgSQL of a hash written in JavaScript, and the
 * only way to know the two agree is to run both. And backfill_wings.sql turns
 * six years of free text into rows exactly once per pilot, in production, with
 * no dry run -- so its merging rules are checked against real SQL rather than
 * read carefully.
 */

let container: StartedPostgreSqlContainer
let client: Client

/** Applies a script the way the loaders do: split on the triple-semicolon. */
async function runScript(name: string): Promise<void> {
    const sql = fs.readFileSync(`./src/model/database/scripts/${name}.sql`, 'utf8')
    for (const statement of sql.split(';;;').map(s => s.trim()).filter(Boolean)) {
        await client.query(statement)
    }
}

async function insertFlight(activityId: string, pilotId: number, wing: string | null): Promise<void> {
    await client.query(
        `insert into flights (strava_activity_id, pilot_id, wing, duration_sec, distance_meters, start_date,
                              description)
         values ($1, $2, $3, 600, 5000, now(), '')`,
        [activityId, pilotId, wing]
    )
}

async function rows<T>(sql: string, values: any[] = []): Promise<T[]> {
    const result = await client.query<T>(sql, values)
    return result.rows.map(row => row.reify())
}

beforeAll(async () => {
    container = await TestContainer.generateEmpty()
    client = await connect({
        host: container.getHost(),
        database: container.getDatabase(),
        user: container.getUsername(),
        password: container.getPassword(),
        port: container.getPort(),
    })
}, 60_000)

afterAll(async () => {
    await client?.end()
    await container?.stop()
})

describe('create_wings.sql', () => {
    it('leaves flights.wing nullable, so an unattributed flight can exist', async () => {
        const [column] = await rows<{ is_nullable: string }>(
            `select is_nullable
             from information_schema.columns
             where table_name = 'flights'
               and column_name = 'wing'`
        )
        expect(column.is_nullable).toBe('YES')
    })

    it('accepts a flight with no wing at all', async () => {
        await insertFlight('nullwing', 900, null)
        const [flight] = await rows<{ wing: string | null }>(
            `select wing from flights where strava_activity_id = 'nullwing'`
        )
        expect(flight.wing).toBeNull()
        await client.query(`delete from flights where strava_activity_id = 'nullwing'`)
    })

    /**
     * The padding the free-text era captured, and why it is not cosmetic.
     *
     * flights.wing is what gets published to Strava, what the per-wing pages
     * route on, and what the map hashes for a track colour when the flight has
     * no wing row -- so "ronin      ", read verbatim off a padded aggregate
     * column, is a different colour and a different URL from "ronin". A real
     * account carries three of them. The backfill has always chosen one
     * spelling for the wing; this is it putting that spelling back on the
     * flights, which is the half that was missing.
     */
    it('settles every flight on the one spelling its wing has', async () => {
        const flights = await rows<{ strava_activity_id: string, wing: string }>(
            `select strava_activity_id, wing
             from flights
             where strava_activity_id in ('w1', 'w4', 'w5', 'w6')
             order by strava_activity_id`
        )

        expect(flights.map(flight => flight.wing)).toEqual(
            ['Zeno 2', 'Zeno 2', 'Zeno 2', 'Zeno 2']
        )
    })

    it('leaves the text alone on a flight it did not attribute', async () => {
        // Whitespace-only, so it produced no wing and must keep whatever it has
        // rather than being pulled onto somebody's glider.
        const [flight] = await rows<{ wing: string | null, wing_id: string | null }>(
            `select wing, wing_id from flights where strava_activity_id = 'w10'`
        )
        expect(flight.wing_id).toBeNull()
        expect(flight.wing).toBe('   ')
    })

    it('is safe to re-run', async () => {
        await expect(runScript('create_wings')).resolves.not.toThrow()
    })
})

describe('track_colour()', () => {
    /**
     * The whole point of reimplementing the hash in SQL is that the backfill can
     * freeze each wing into the colour its tracks are *already* drawn in. If
     * these two ever diverge, every pilot's map repaints on the day the backfill
     * runs.
     *
     * The long key is deliberate: it drives the hash through the 32-bit
     * overflow that the two implementations handle differently on paper -- `| 0`
     * in JavaScript, an explicit modulo in PL/pgSQL.
     */
    const keys = [
        '',
        'a',
        'unknown',
        '12345Zeno 2',
        '12345unknown',
        '987Ozone Rush 5',
        '1Zeno 2',
        '1zeno 2',
        '42Nova Mentor 7',
        '999 leading space',
        'trailing space ',
        'accented Zéno 2',
        '1'.repeat(64),
    ]

    it.each(keys)('agrees with trackColourFor(%j)', async (key) => {
        const [result] = await rows<{ colour: string }>('select track_colour($1) as colour', [key])
        expect(result.colour).toBe(trackColourFor(key))
    })
})

describe('backfill_wings.sql', () => {
    beforeAll(async () => {
        await client.query(`insert into pilots (pilot_id, first_name)
                            values (901, 'Theo'), (902, 'Camille')`)

        // Four spellings of one glider. "Zeno 2" is the most-flown, so it is the
        // spelling that should survive and the colour that should be kept.
        await insertFlight('w1', 901, 'Zeno 2')
        await insertFlight('w2', 901, 'Zeno 2')
        await insertFlight('w3', 901, 'Zeno 2')
        await insertFlight('w4', 901, 'zeno2')
        await insertFlight('w5', 901, 'Zeno 2 ')
        await insertFlight('w6', 901, 'Zeno  2')
        // A genuinely different glider for the same pilot.
        await insertFlight('w7', 901, 'Ozone Rush 5')
        // Same name, different pilot: must not merge across pilots.
        await insertFlight('w8', 902, 'Zeno 2')
        // Rows that must produce no wing at all.
        await insertFlight('w9', 901, null)
        await insertFlight('w10', 901, '   ')

        await runScript('backfill_wings')
    }, 60_000)

    it('creates one wing per glider, not one per spelling', async () => {
        const wings = await rows<{ pilot_id: number, name: string }>(
            `select pilot_id, name from wings order by pilot_id, name`
        )
        expect(wings).toHaveLength(3)
    })

    it('keeps the most-flown spelling as the name', async () => {
        const [wing] = await rows<{ name: string }>(
            `select name from wings where pilot_id = 901 and wing_key(name) = 'zeno2'`
        )
        expect(wing.name).toBe('Zeno 2')
    })

    it('freezes the colour the wing was already being drawn in', async () => {
        const [wing] = await rows<{ colour: string }>(
            `select colour from wings where pilot_id = 901 and wing_key(name) = 'zeno2'`
        )
        expect(wing.colour).toBe(trackColourFor('901Zeno 2'))
    })

    it('does not merge two pilots who fly the same model', async () => {
        const wings = await rows<{ pilot_id: number }>(
            `select pilot_id from wings where wing_key(name) = 'zeno2'`
        )
        expect(wings.map(w => w.pilot_id).sort()).toEqual([901, 902])
    })

    it('links every spelling to the same wing', async () => {
        const linked = await rows<{ wing_id: string }>(
            `select distinct wing_id
             from flights
             where strava_activity_id in ('w1', 'w4', 'w5', 'w6')`
        )
        expect(linked).toHaveLength(1)
    })

    it('leaves flights with no wing name unattributed rather than inventing one', async () => {
        const unattributed = await rows<{ wing_id: string | null }>(
            `select wing_id from flights where strava_activity_id in ('w9', 'w10')`
        )
        expect(unattributed.every(flight => flight.wing_id === null)).toBe(true)
    })

    it('is safe to re-run', async () => {
        await runScript('backfill_wings')
        const [count] = await rows<{ n: number }>(`select count(*)::int as n from wings`)
        expect(count.n).toBe(3)
    })

    /**
     * `on delete set null`, not cascade. Deleting a wing must unattribute its
     * flights, never delete them -- an unattributed flight is a legal state,
     * a deleted one is somebody's afternoon gone.
     */
    it('unattributes flights when a wing is deleted, and keeps the flights', async () => {
        await client.query(`delete from wings where pilot_id = 902`)
        const [flight] = await rows<{ wing_id: string | null }>(
            `select wing_id from flights where strava_activity_id = 'w8'`
        )
        expect(flight.wing_id).toBeNull()

        const [count] = await rows<{ n: number }>(
            `select count(*)::int as n from flights where strava_activity_id = 'w8'`
        )
        expect(count.n).toBe(1)
    })
})

/**
 * The write layer.
 *
 * Every one of these moves flight attribution around, several of them in bulk,
 * and two of them delete a row. They also all have to keep `flights.wing` in
 * step with `wings.name` — that text column is what gets published to Strava and
 * what the per-wing pages route on, so an operation that updated only the wing
 * row would look right on the dashboard and be wrong everywhere else.
 */
describe('Wings write layer', () => {
    const PILOT = 903
    const OTHER_PILOT = 904

    beforeAll(async () => {
        await client.query(`insert into pilots (pilot_id, first_name)
                            values ($1, 'Wren'), ($2, 'Intruder')`, [PILOT, OTHER_PILOT])
    }, 60_000)

    async function freshWing(name: string, colour = '#3b82f6') {
        const result = await Wings.create(PILOT, { name, colour })
        if (!isSuccess(result)) throw new Error(result[1])
        return result[0]
    }

    it('creates a wing', async () => {
        const wing = await freshWing('Ozone Zeno 2')
        expect(wing.name).toBe('Ozone Zeno 2')
        expect(wing.pilot_id).toBe(PILOT)
    })

    it('refuses a second wing with the same name, in words a pilot can act on', async () => {
        const again = await Wings.create(PILOT, { name: 'ozone  zeno 2', colour: '#ef4444' })
        expect(isSuccess(again)).toBe(false)
        expect(String(again[1])).toContain('already have a wing')
    })

    it('returns calendar dates as strings, not instants', async () => {
        const created = await Wings.create(PILOT, {
            name: 'Dated Wing',
            colour: '#22c55e',
            flown_from: '2022-03-01',
            flown_until: '2024-09-30',
        })
        if (!isSuccess(created)) throw new Error(created[1])
        // A Date here would carry the server's timezone and could move the
        // boundary by a day, silently reassigning the flights either side of it.
        expect(created[0].flown_from).toBe('2022-03-01')
        expect(created[0].flown_until).toBe('2024-09-30')
    })

    it('renaming a wing renames it on its flights too', async () => {
        const wing = await freshWing('Typo Wign', '#f59e0b')
        await insertFlight('rename1', PILOT, 'Typo Wign')
        await client.query(`update flights set wing_id = $1::uuid where strava_activity_id = 'rename1'`,
            [wing.wing_id])

        const updated = await Wings.update(PILOT, wing.wing_id, { name: 'Typo Wing', colour: '#f59e0b' })
        expect(isSuccess(updated)).toBe(true)

        const [flight] = await rows<{ wing: string }>(
            `select wing from flights where strava_activity_id = 'rename1'`)
        expect(flight.wing).toBe('Typo Wing')
    })

    it('will not let one pilot touch another pilot\'s wing', async () => {
        const wing = await freshWing('Not Yours', '#8b5cf6')

        const update = await Wings.update(OTHER_PILOT, wing.wing_id, { name: 'Stolen', colour: '#ef4444' })
        expect(isSuccess(update)).toBe(false)

        const remove = await Wings.remove(OTHER_PILOT, wing.wing_id)
        expect(isSuccess(remove)).toBe(false)

        const [survivor] = await rows<{ name: string }>(
            `select name from wings where wing_id = $1::uuid`, [wing.wing_id])
        expect(survivor.name).toBe('Not Yours')
    })

    it('merges one wing into another, moving its flights and its name', async () => {
        const source = await freshWing('Zeno II', '#ec4899')
        const target = await freshWing('Zeno 2 proper', '#06b6d4')
        await insertFlight('merge1', PILOT, 'Zeno II')
        await insertFlight('merge2', PILOT, 'Zeno II')
        await client.query(
            `update flights set wing_id = $1::uuid where strava_activity_id in ('merge1', 'merge2')`,
            [source.wing_id])

        const merged = await Wings.merge(PILOT, source.wing_id, target.wing_id)
        expect(isSuccess(merged)).toBe(true)
        expect(merged[0]).toBe(2)

        const moved = await rows<{ wing: string, wing_id: string }>(
            `select wing, wing_id from flights where strava_activity_id in ('merge1', 'merge2')`)
        expect(moved.every(f => f.wing_id === target.wing_id)).toBe(true)
        expect(moved.every(f => f.wing === 'Zeno 2 proper')).toBe(true)

        const gone = await rows<{ n: number }>(
            `select count(1)::int as n from wings where wing_id = $1::uuid`, [source.wing_id])
        expect(gone[0].n).toBe(0)
    })

    it('refuses to merge a wing into itself', async () => {
        const wing = await freshWing('Lonely', '#84cc16')
        const merged = await Wings.merge(PILOT, wing.wing_id, wing.wing_id)
        expect(isSuccess(merged)).toBe(false)
    })

    /**
     * Deleting has to clear the text column as well as the foreign key. The FK
     * is `on delete set null`, but `flights.wing` is plain text no constraint
     * touches — leaving it would produce a flight with no wing_id still claiming
     * a wing by name, which is the inconsistent state wings exist to end.
     */
    it('deleting a wing leaves its flights with no wing at all', async () => {
        const wing = await freshWing('Doomed', '#f97316')
        await insertFlight('del1', PILOT, 'Doomed')
        await client.query(`update flights set wing_id = $1::uuid where strava_activity_id = 'del1'`,
            [wing.wing_id])

        const removed = await Wings.remove(PILOT, wing.wing_id)
        expect(isSuccess(removed)).toBe(true)
        expect(removed[0]).toBe(1)

        const [flight] = await rows<{ wing: string | null, wing_id: string | null }>(
            `select wing, wing_id from flights where strava_activity_id = 'del1'`)
        expect(flight.wing_id).toBeNull()
        expect(flight.wing).toBeNull()
    })

    describe('assignToDateRange', () => {
        let wing: { wing_id: string }

        beforeAll(async () => {
            wing = await freshWing('Range Wing', '#6366f1')
            await client.query(
                `insert into flights (strava_activity_id, pilot_id, wing, duration_sec, distance_meters,
                                      start_date, description)
                 values ('r-before', $1, null, 600, 5000, '2022-02-28T14:00:00Z', ''),
                        ('r-open', $1, null, 600, 5000, '2022-03-01T00:00:00Z', ''),
                        ('r-close', $1, null, 600, 5000, '2024-09-30T18:30:00Z', ''),
                        ('r-after', $1, null, 600, 5000, '2024-10-01T09:00:00Z', '')`,
                [PILOT])
        }, 60_000)

        /**
         * The trap: start_date is a timestamp, so `<= '2024-09-30'` compares an
         * 18:30 flight against midnight and drops it. A pilot who says they flew
         * a wing until the 30th means the whole of the 30th.
         */
        it('includes the whole of the closing day', async () => {
            const assigned = await Wings.assignToDateRange(PILOT, wing.wing_id, '2022-03-01', '2024-09-30')
            expect(isSuccess(assigned)).toBe(true)

            const inside = await rows<{ strava_activity_id: string }>(
                `select strava_activity_id from flights
                 where wing_id = $1::uuid order by strava_activity_id`, [wing.wing_id])
            expect(inside.map(f => f.strava_activity_id)).toEqual(['r-close', 'r-open'])
        })

        it('leaves flights outside the period alone', async () => {
            const outside = await rows<{ wing_id: string | null }>(
                `select wing_id from flights where strava_activity_id in ('r-before', 'r-after')`)
            expect(outside.every(f => f.wing_id === null)).toBe(true)
        })

        it('does not overrule a wing the pilot already set, when asked not to', async () => {
            const other = await freshWing('Already Set', '#3b82f6')
            await client.query(
                `update flights set wing_id = $1::uuid, wing = 'Already Set'
                 where strava_activity_id = 'r-before'`, [other.wing_id])

            await Wings.assignToDateRange(PILOT, wing.wing_id, null, null, true)

            const [kept] = await rows<{ wing: string }>(
                `select wing from flights where strava_activity_id = 'r-before'`)
            expect(kept.wing).toBe('Already Set')
        })
    })
})
