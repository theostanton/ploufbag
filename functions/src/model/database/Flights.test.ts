import {expect, test} from "vitest";
import {end} from "./client";
import {TestContainer} from "./generateContainer.test";
import {Mocks} from "./Mocks.test";
import {Flights} from "./Flights";

test('Pilots.upsert()', async () => {

    const container = await TestContainer.generateEmpty()

    const activity1 = Mocks.user1activity1wing1

    // Either<V> is the tuple [value, error]; `.success` never existed on it, so
    // the old guard silently passed and the assertion compared undefined to true.
    const [, upsertError] = await Flights.upsert([Mocks.user1activity1wing1])
    expect(upsertError).toBeUndefined()

    const [flight, getError] = await Flights.get(activity1.strava_activity_id)
    expect(getError).toBeUndefined()
    expect(flight).toStrictEqual(activity1)

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