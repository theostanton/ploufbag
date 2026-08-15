import {expect, test} from "vitest";
import {TestContainer} from "./generateContainer.test";
import {Site} from "@ploufbag/common";
import {Sites} from "./Sites";
import {Mocks} from "./Mocks.test";
import {end, withPooledClient} from "./client";


test('Sites.upsert() ', async () => {
    const container = await TestContainer.generateEmpty()

    const sites: Site[] = [
        {
            slug: "some-slug",
            lng: 1.1,
            lat: 2.2,
            alt: 333,
            type: null,
            polygon: [[1.1, 1.2], [2.1, 2.2], [3.1, 3.2]],
            nearest_balise_id: null,
            ffvl_sid: "sid",
            name: "Some name"
        }
    ]

    const [, insertError] = await Sites.upsert(sites)
    expect(insertError).toBeUndefined()

    const [, upsertError] = await Sites.upsert(sites)
    expect(upsertError).toBeUndefined()

    await container?.stop()
})

test('Sites.upsert() disambiguates a slug already held by another site', async () => {
    const container = await TestContainer.generateEmpty()

    // create_sites.sql seeds ffvl_sid=1 with slug chamonix---plan-praz---brevent.
    // Mocks.planpraz carries that same slug under a different ffvl_sid (123) —
    // the shape real FFVL data produces when two sites share a toponym, since
    // slug is slugify(toponym). This used to raise sites_slug_key and drop the
    // site entirely.
    const [, upsertError] = await Sites.upsert([Mocks.planpraz])
    expect(upsertError).toBeUndefined()

    const rows = await withPooledClient(async (client) =>
        (await client.query<{ ffvl_sid: string, slug: string }>(
            "select ffvl_sid, slug from sites where ffvl_sid in ('1', $1) order by ffvl_sid",
            [Mocks.planpraz.ffvl_sid]
        )).rows.map(row => row.reify())
    )

    // The incumbent keeps the clean URL; the newcomer is suffixed with its id.
    expect(rows).toStrictEqual([
        {ffvl_sid: "1", slug: "chamonix---plan-praz---brevent"},
        {ffvl_sid: "123", slug: "chamonix---plan-praz---brevent-123"},
    ])

    // Re-running the sync must be idempotent, not append another suffix.
    const [, repeatError] = await Sites.upsert([Mocks.planpraz])
    expect(repeatError).toBeUndefined()

    const repeated = await withPooledClient(async (client) =>
        (await client.query<{ slug: string }>(
            "select slug from sites where ffvl_sid = $1", [Mocks.planpraz.ffvl_sid]
        )).rows.map(row => row.reify().slug)
    )
    expect(repeated).toStrictEqual(["chamonix---plan-praz---brevent-123"])

    await end()
    await container?.stop()
})

test('Sites.getIdOfCloset() ', async () => {
    const container = await TestContainer.generateEmpty()

    // generateEmpty() is not empty: create_sites.sql seeds five fixture sites
    // (ffvl_sid 1-5).
    //
    // Mocks.home sits ~0.8km from seeded ffvl_sid=4 (le-bois-du-bouchet) and
    // ~2km from plan-praz, so 4 is the correct nearest. getIdOfCloset returns
    // ffvl_sid — the query aliases it `slug`, but the column it feeds is
    // flights.takeoff_id.
    const result = await Sites.getIdOfCloset(Mocks.home)

    expect(result).toEqual("4")

    await container?.stop()

})