import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {Client, connect} from "ts-postgres";
import {TestContainer} from "./generateContainer.test";
import {Activities, isSuccess, type ScannedActivity} from "@ploufbag/common";

/**
 * The activities table.
 *
 * One rule here matters more than the rest: a scan writes `verdict`, only a
 * person writes `pilot_verdict`, and a re-scan must never touch the second. Get
 * that wrong and a better classifier silently promotes back everything a pilot
 * has already rejected -- which for someone with a thousand activities means
 * their rejections were pointless, and they will not trust the next ones either.
 */

let container: StartedPostgreSqlContainer
let client: Client

const PILOT = 700

function scanned(overrides: Partial<ScannedActivity> = {}): ScannedActivity {
    return {
        strava_activity_id: 'a1',
        pilot_id: PILOT,
        type: 'Workout',
        name: 'Afternoon Workout',
        start_date: new Date('2024-06-01T10:00:00Z'),
        distance_meters: 12_000,
        elapsed_sec: 2_700,
        moving_sec: 2_600,
        total_elevation_gain: 300,
        start_lat: 45.8,
        start_lng: 6.2,
        end_lat: 45.86,
        end_lng: 6.22,
        polyline: [[45.8, 6.2], [45.86, 6.22]],
        verdict: 'unsure',
        score: 45,
        reasons: [{code: 'takeoff', text: 'Started at Planfait', points: 40}],
        takeoff_id: null,
        landing_id: null,
        ...overrides,
    }
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
    await client.query(`insert into pilots (pilot_id, first_name) values ($1, 'Scout')`, [PILOT])
}, 60_000)

afterAll(async () => {
    await client?.end()
    await container?.stop()
})

describe('recording a scan', () => {
    it('stores a verdict, its score and the reasons behind it', async () => {
        const result = await Activities.upsertScanned([scanned()])
        expect(isSuccess(result)).toBe(true)

        const found = await Activities.get(PILOT, 'a1')
        if (!isSuccess(found)) throw new Error(found[1])
        expect(found[0].verdict).toBe('unsure')
        expect(found[0].score).toBe(45)
        // The reasons are stored rather than recomputed because they are what
        // make a verdict checkable by the pilot, and they have to still say the
        // same thing after the thresholds move.
        expect(found[0].reasons[0].text).toBe('Started at Planfait')
    })

    it('updates what it scanned before', async () => {
        await Activities.upsertScanned([scanned({name: 'Renamed on Strava', verdict: 'flight', score: 95})])
        const found = await Activities.get(PILOT, 'a1')
        if (!isSuccess(found)) throw new Error(found[1])
        expect(found[0].name).toBe('Renamed on Strava')
        expect(found[0].verdict).toBe('flight')
    })
})

describe('the pilot always wins', () => {
    it('a re-scan does not overwrite what the pilot decided', async () => {
        await Activities.upsertScanned([scanned({strava_activity_id: 'a2', verdict: 'flight', score: 90})])
        // The pilot disagrees.
        await client.query(
            `update activities set pilot_verdict = 'not_flight'::activity_verdict, decided_at = now()
             where strava_activity_id = 'a2'`)

        // A later, more confident scan says flight again.
        await Activities.upsertScanned([scanned({strava_activity_id: 'a2', verdict: 'flight', score: 140})])

        const [row] = await rows<{ verdict: string, pilot_verdict: string }>(
            `select verdict, pilot_verdict from activities where strava_activity_id = 'a2'`)
        expect(row.verdict).toBe('flight')
        expect(row.pilot_verdict).toBe('not_flight')
    })

    it('reads and counts by what the pilot said, not what we think', async () => {
        const listed = await Activities.getForPilot(PILOT, 'not_flight')
        if (!isSuccess(listed)) throw new Error(listed[1])
        expect(listed[0].map(a => a.strava_activity_id)).toContain('a2')

        const counted = await Activities.countsForPilot(PILOT)
        if (!isSuccess(counted)) throw new Error(counted[1])
        expect(counted[0].not_flight).toBeGreaterThanOrEqual(1)
    })
})

describe('the empty state', () => {
    /**
     * What turns "we found nothing" from a dead end into one question: a pilot
     * who logs flights as a Hike is shown their own Hikes and taps once.
     */
    it('counts the pilot\'s own activity types, most used first', async () => {
        await Activities.upsertScanned([
            scanned({strava_activity_id: 'h1', type: 'Hike', verdict: 'not_flight'}),
            scanned({strava_activity_id: 'h2', type: 'Hike', verdict: 'not_flight'}),
            scanned({strava_activity_id: 'h3', type: 'Hike', verdict: 'not_flight'}),
            scanned({strava_activity_id: 'r1', type: 'Ride', verdict: 'not_flight'}),
        ])

        const types = await Activities.typeCountsForPilot(PILOT)
        if (!isSuccess(types)) throw new Error(types[1])
        expect(types[0][0].type).toBe('Hike')
        expect(types[0][0].activities).toBe(3)
    })
})

describe('what a scan keeps', () => {
    it('keeps a track for anything that might be a flight', async () => {
        const found = await Activities.get(PILOT, 'a1')
        if (!isSuccess(found)) throw new Error(found[1])
        expect(found[0].polyline).not.toBeNull()
    })

    /**
     * Geometry is stored only where it will be looked at. "Was this a flight?"
     * is never asked about the eleven hundred rides we already know are not, so
     * storing their tracks would be most of the table for none of the value.
     */
    it('does not keep a track for something it is sure about', async () => {
        await Activities.upsertScanned([
            scanned({strava_activity_id: 'ride1', type: 'Ride', verdict: 'not_flight', polyline: null}),
        ])
        const found = await Activities.get(PILOT, 'ride1')
        if (!isSuccess(found)) throw new Error(found[1])
        expect(found[0].polyline).toBeNull()
    })
})
