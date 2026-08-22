import {expect, test} from "vitest";
import {end} from "./client";
import {TestContainer} from "./generateContainer.test";
import {Mocks} from "./Mocks.test";
import {Flights} from "./Flights";
import {SLUG_PATTERN} from "@ploufbag/common";

test('Pilots.upsert()', async () => {

    const container = await TestContainer.generateEmpty()

    const activity1 = Mocks.user1activity1wing1

    // Either<V> is the tuple [value, error]; `.success` never existed on it, so
    // the old guard silently passed and the assertion compared undefined to true.
    const [, upsertError] = await Flights.upsert([Mocks.user1activity1wing1])
    expect(upsertError).toBeUndefined()

    const [flight, getError] = await Flights.get(activity1.strava_activity_id)
    expect(getError).toBeUndefined()

    // slug is minted by the database default (generate_flight_slug()) rather
    // than supplied by the caller, so it is on the row read back but not on the
    // mock. Assert it separately, then compare everything that was written.
    expect(flight!.slug).toMatch(SLUG_PATTERN)

    // wing_id is the same shape of thing: a column the table has and the caller
    // did not supply. Null here is the point rather than an oversight -- a
    // flight whose wing we cannot work out is a legal, permanent state, where
    // before it was a flight that got thrown away.
    expect(flight!.wing_id).toBeNull()

    const {slug, wing_id, ...writtenFields} = flight!
    expect(writtenFields).toStrictEqual(activity1)

    // The slug is published to Strava, so re-syncing the activity must not
    // change it. Flights.upsert's on-conflict branch leaves the column alone.
    const [, reUpsertError] = await Flights.upsert([{...activity1, wing: 'A Different Wing'}])
    expect(reUpsertError).toBeUndefined()

    const [reFetched] = await Flights.get(activity1.strava_activity_id)
    expect(reFetched!.wing).toBe('A Different Wing')
    expect(reFetched!.slug).toBe(slug)

    await end()
    await container?.stop()
})
//
// test('Pilots.upsert()', async () => {
//
//     const container = await TestContainer.generateEmpty()
//
//     const upsertResult = await Flights.upsert([Mocks.flightRow])
//
//     if (upsertResult.success == false) {
//         console.error(upsertResult.error)
//     }
//     expect(upsertResult.success).toBe(true)
//
//     const result = await Flights.get(activity1.strava_activity_id)
//     expect(result).toBeInstanceOf(Success<FlightRow>)
//     expect(result).toStrictEqual(new Success(activity1))
//
//     await end()
//     await container?.stop()
// })