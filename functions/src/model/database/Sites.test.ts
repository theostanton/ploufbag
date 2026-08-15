import {expect, test} from "vitest";
import {TestContainer} from "./generateContainer.test";
import {Site, isSuccess} from "@parastats/common";
import {Sites} from "./Sites";
import {Mocks} from "./Mocks.test";


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

test('Sites.getIdOfCloset() ', async () => {
    const container = await TestContainer.generateEmpty()

    // generateEmpty() is not empty: create_sites.sql seeds five fixture sites
    // (ffvl_sid 1-5). Upserting Mocks.planpraz here used to collide with seeded
    // ffvl_sid=1 on the unique `slug` constraint — which `on conflict(ffvl_sid)`
    // does not cover — so the upsert silently failed and the assertion compared
    // against a site that was never inserted.
    //
    // Mocks.home sits ~0.8km from seeded ffvl_sid=4 (le-bois-du-bouchet) and
    // ~2km from plan-praz, so 4 is the correct nearest. getIdOfCloset returns
    // ffvl_sid — the query aliases it `slug`, but the column it feeds is
    // flights.takeoff_id.
    const result = await Sites.getIdOfCloset(Mocks.home)

    expect(result).toEqual("4")

    await container?.stop()

})