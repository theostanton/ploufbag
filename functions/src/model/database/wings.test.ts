import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {Client, connect} from "ts-postgres";
import * as fs from "node:fs";
import {TestContainer} from "./generateContainer.test";
import {trackColourFor} from "@ploufbag/common";

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
