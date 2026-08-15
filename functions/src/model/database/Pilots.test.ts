import {expect, test} from "vitest";
import {end} from "./client";
import {Pilots} from "./Pilots";
import {PilotRow, PilotRowFull, Success} from "@parastats/common";
import {TestContainer} from "./generateContainer.test";

test('Test insert() / get() / getToken()', async () => {

    const container = await TestContainer.generateEmpty()

    const expiresAt = new Date(2000, 1, 2, 3, 4)

    const pilot: PilotRowFull = {
        pilot_id: 123,
        strava_access_token: "access_token",
        strava_refresh_token: "refresh_token",
        strava_expires_at: expiresAt,
        first_name: "Some name"
    }

    await Pilots.insert(pilot)

    const userResult = await Pilots.getFull(pilot.pilot_id)
    expect(userResult).toBeInstanceOf(Success<PilotRow>)
    expect(userResult).toStrictEqual(new Success(pilot))

    const tokenResult = await Pilots.getAccessToken(pilot.pilot_id)
    expect(userResult).toBeInstanceOf(Success<string>)
    expect(tokenResult).toStrictEqual(new Success(pilot.strava_access_token))

    await end()
    await container?.stop()
})