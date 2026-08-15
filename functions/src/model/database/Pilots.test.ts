import {expect, test} from "vitest";
import {end} from "./client";
import {Pilots} from "./Pilots";
import {PilotRowFull} from "@parastats/common";
import {TestContainer} from "./generateContainer.test";

test('Test insert() / get() / getToken()', async () => {

    const container = await TestContainer.generateEmpty()

    // Must be in the future. getAccessToken refreshes an expired token against
    // the live Strava API using process.env.CLIENT_ID, which is unset under test
    // — so a past expiry made this throw on `undefined.toString()` rather than
    // exercising the stored-token path this test is asserting.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const pilot: PilotRowFull = {
        pilot_id: 123,
        strava_access_token: "access_token",
        strava_refresh_token: "refresh_token",
        strava_expires_at: expiresAt,
        first_name: "Some name",
        profile_image_url: null
    }

    await Pilots.insert(pilot)

    // Either<V> is the tuple [value, error] — Success is a type alias, not a
    // class, so the old `new Success(...)` / toBeInstanceOf assertions could
    // never pass.
    const [fetchedPilot, pilotError] = await Pilots.getFull(pilot.pilot_id)
    expect(pilotError).toBeUndefined()
    expect(fetchedPilot).toStrictEqual(pilot)

    const [accessToken, tokenError] = await Pilots.getAccessToken(pilot.pilot_id)
    expect(tokenError).toBeUndefined()
    expect(accessToken).toEqual(pilot.strava_access_token)

    await end()
    await container?.stop()
})