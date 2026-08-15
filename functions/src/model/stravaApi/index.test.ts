import {isSuccess} from "@parastats/common";
import {beforeAll, expect, it, test} from "vitest";
import {StravaApi} from "./index";
import {Pilots} from "../database/Pilots";
import getToken = Pilots.getAccessToken;


let token: string | undefined;

// Both tests below are skipped — they hit the live Strava API with a real
// pilot's token. The hook still ran and threw, failing the whole file in CI
// where there is no database and no such pilot. Record the failure for whoever
// unskips these locally instead of taking the suite down with it.
beforeAll(async () => {
    try {
        const [accessToken, error] = await getToken(4142500)
        if (error) {
            console.warn(`Strava token unavailable, live tests cannot run: ${error}`)
            return
        }
        token = accessToken
    } catch (error) {
        console.warn(`Strava token unavailable, live tests cannot run: ${error}`)
    }
})

test.skip('Test fetchWingedActivities', {timeout: 60_000}, async () => {
    const api = StravaApi.fromAccessToken(token!!)
    const [activityIds, error] = await api.fetchParaglidingActivityIds()
    expect(error).toBeUndefined()
    expect(activityIds!.length).toEqual(5)
})

test.skip('Test fetchAthlete', async () => {
    const api = StravaApi.fromAccessToken(token!!)

    const athlete = await api.fetchAthlete()

    expect(athlete.firstname).toEqual("Theo")
})