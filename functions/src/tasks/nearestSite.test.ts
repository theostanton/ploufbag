import { expect, test } from 'vitest'
import { Sites } from '@ploufbag/common'
import { withPooledClient } from '@ploufbag/common'
import { TestContainer } from '@/database/generateContainer.test'

/**
 * Finding the site nearest a point, and finding it without reading the table.
 *
 * `Sites.getNearestWithin` is asked twice per activity by the history scan, and
 * the scan reads a whole Strava history -- thousands of calls inside one HTTP
 * request. It used to sort every site in the table by a distance computed at run
 * time, which no index can help with, and that alone took FetchAllActivities
 * past the tasks service's nine minute timeout: the sync workflow got a 504 back
 * instead of a summary, and none of the pilot's missing flights were imported.
 *
 * So there are two things worth holding still here. The first is the answer,
 * which must not have changed. The second is that the answer still comes from
 * the index -- because dropping the `earth_box` restriction is a one line
 * simplification that leaves every behavioural test green and quietly puts the
 * timeout back.
 */

/** Metres north of a point, as a latitude offset. Close enough at these scales. */
function north(point: [number, number], metres: number): [number, number] {
    return [point[0] + metres / 111_320, point[1]]
}

// create_sites.sql seeds ffvl_sid=1 at Planpraz.
const PLANPRAZ: [number, number] = [45.9047, 6.8831]

test('getNearestWithin finds a site inside the limit and refuses one outside', async () => {
    const container = await TestContainer.generateEmpty()

    // Just inside 500m.
    const near = await Sites.getNearestWithin(north(PLANPRAZ, 400))
    expect(near?.ffvl_sid).toEqual('1')
    expect(near!.distance_meters).toBeLessThan(500)

    // Just outside it. The bounding box is a cube, so it lets some of these
    // through to the query; the distance check is what must still reject them.
    expect(await Sites.getNearestWithin(north(PLANPRAZ, 600))).toBeNull()

    // Far enough that nothing is in the box at all -- the other branch.
    expect(await Sites.getNearestWithin([48.8584, 2.2945])).toBeNull()

    // And an explicit limit is honoured rather than ignored in favour of 500m.
    expect(await Sites.getNearestWithin(north(PLANPRAZ, 600), 1_000)).not.toBeNull()
    expect(await Sites.getNearestWithin(north(PLANPRAZ, 400), 100)).toBeNull()

    await container?.stop()
}, 120_000)

test('it answers from the index rather than reading every site', async () => {
    const container = await TestContainer.generateEmpty()

    await withPooledClient(async client => {
        // A handful of rows is seq-scanned however it is indexed, and rightly
        // so. The planner only has a choice to get wrong once the table is the
        // size of the real FFVL list.
        await client.query(`
            insert into sites (ffvl_sid, slug, name, lat, lng, alt)
            select 'bulk' || g, 'bulk-' || g, 'Bulk ' || g,
                   41 + random() * 10, -1 + random() * 9, 1000
            from generate_series(1, 3000) g`)
        await client.query('analyze sites')
    })

    const plan = await withPooledClient(async client => {
        const result = await client.query<{ 'QUERY PLAN': string }>(
            `explain select ffvl_sid, name, distance(lat, lng, $1, $2) as distance_meters
             from sites
             where earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(lat, lng)
             order by distance_meters
             limit 1`,
            [PLANPRAZ[0], PLANPRAZ[1], Sites.MATCH_METRES]
        )
        return result.rows.map(row => row.reify()['QUERY PLAN']).join('\n')
    })

    expect(plan, `no index in:\n${plan}`).toContain('sites_earth_idx')
    expect(plan, `still scanning every site:\n${plan}`).not.toContain('Seq Scan on sites')

    // And the index is answering the same question, not a narrower one.
    expect((await Sites.getNearestWithin(north(PLANPRAZ, 400)))?.ffvl_sid).toEqual('1')

    await container?.stop()
}, 120_000)
