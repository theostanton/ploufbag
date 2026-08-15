import {afterAll, afterEach, beforeAll, beforeEach, expect, it, test} from "vitest";
import {TestContainer} from "../../model/database/generateContainer.test";
import {StartedPostgreSqlContainer} from "@testcontainers/postgresql";
// `end` is not exported by @parastats/common — it is the local alias for
// closeAllConnections, re-exported from model/database/client, which is how the
// other test files import it.
import {end} from "../../model/database/client";
import {DescriptionPreference, FlightRow, DescriptionFormatter, withPooledClient} from "@parastats/common";
import {Mocks} from "../../model/database/Mocks.test";

let container: StartedPostgreSqlContainer

beforeAll(async () => {
    container = await TestContainer.generateFromMocks()
})

afterAll(async () => {
    await end()
    await container?.stop()
})


type Input = {
    preference: DescriptionPreference,
    flight: FlightRow,
}

const AllEnabled: DescriptionPreference = {
    pilot_id: Mocks.userRow1.pilot_id,
    include_wing_aggregate: true,
    include_year_aggregate: true,
    include_wind: true,
    include_sites: true,
    include_all_time_aggregate: true
}
const AllDisabled: DescriptionPreference = {
    pilot_id: Mocks.userRow1.pilot_id,
    include_wing_aggregate: false,
    include_year_aggregate: false,
    include_wind: false,
    include_sites: false,
    include_all_time_aggregate: false
}
// With include_sites, appendSites joins flights.takeoff_id/landing_id against
// sites.ffvl_sid. Every mock flight carries takeoff_id "456" and landing_id
// "123" — Mocks.forclaz and Mocks.planpraz — so each expectation below is
// prefixed with the same two lines. They were absent before only because those
// two mock sites lost the slug collision in Sites.upsert and were never
// inserted, so the join matched nothing. No aggregate figure changes.
const siteLines = "↗️ Col de la Forclaz - Montmin\n↘️ Chamonix - Plan Praz - Brevent\n"

const cases: [
    title: string,
    input: Input,
    expected: string | null
][] = [

    ["User 1 Activity 1", {flight: Mocks.user1activity1wing1, preference: AllEnabled},
        siteLines + "🪂 One 1 flight / 5min \n2025 1 flight / 5min\nAll Time 1 flight / 5min\n🌐 ploufbag.com"],

    // Spread AllEnabled, not AllDisabled. include_wind was already false in
    // AllDisabled, so this case was identical to the one below it — which
    // asserts null — while expecting full output. The expected string here is
    // AllEnabled minus the wind line, which is what this case is meant to cover.
    // The mock sites have no nearest_balise_id, so no wind is appended either
    // way; this case pins that turning include_wind off changes nothing else.
    ["User 1 Activity 1", {flight: Mocks.user1activity1wing1, preference: {...AllEnabled, include_wind: false}},
        siteLines + "🪂 One 1 flight / 5min \n2025 1 flight / 5min\nAll Time 1 flight / 5min\n🌐 ploufbag.com"],

    ["User 1 Activity 1", {flight: Mocks.user1activity1wing1, preference: AllDisabled},
        null],

    ["User 1 Activity 2", {flight: Mocks.user1activity2wing2, preference: AllEnabled},
        siteLines + "🪂 Two 1 flight / 1h 0min\n2025 2 flights / 1h 5min\nAll Time 2 flights / 1h 5min\n🌐 ploufbag.com"],

    ["User 1 Activity 3", {flight: Mocks.user1activity3wing1, preference: AllEnabled},
        siteLines + "🪂 One 2 flights / 15min\n2025 3 flights / 1h 15min\nAll Time 3 flights / 1h 15min\n🌐 ploufbag.com"],
]

test.each(cases)('generateStats(%s)', async (_, input, expected) => {
    const formatter = new DescriptionFormatter(input.flight, input.preference);
    const actual = await withPooledClient(async (client) => {
        return await formatter.generate(client);
    });
    expect(actual?.replace(/\s/g, '')).toEqual(expected?.replace(/\s/g, ''))
})

