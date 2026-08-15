import {expect, test} from "vitest";
import {FlightRow, PilotRow, PilotRowFull, isSuccess, Success} from "@parastats/common";
import {Pilots} from "./Pilots";
import {end, getDatabase} from "./client";
import {TestContainer} from "./generateContainer.test";
import {Mocks} from "./Mocks.test";
import {Flights} from "./Flights";

test('Pilots.upsert()', async () => {

    const container = await TestContainer.generateEmpty()

    const activity1 = Mocks.user1activity1wing1
    const upsertResult = await Flights.upsert([Mocks.user1activity1wing1])

    if (upsertResult.success == false) {
        console.error(upsertResult.error)
    }
    expect(upsertResult.success).toBe(true)

    const result = await Flights.get(activity1.strava_activity_id)
    expect(result).toBeInstanceOf(Success<FlightRow>)
    expect(result).toStrictEqual(new Success(activity1))

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