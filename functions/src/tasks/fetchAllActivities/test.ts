import {isSuccess} from "@ploufbag/common";
import {expect, test} from "vitest";
import initialiseUser from "./index";
import {FetchAllActivitiesTask, UpdateDescriptionTask} from "@ploufbag/common";

test("fetchAllActivities success", async () => {
    const input: FetchAllActivitiesTask = {
        name: "FetchAllActivities",
        pilotId: 123,
    }
    const result = await initialiseUser(input)
    expect(result.success).toEqual(true)
})

test("updateDescription fail on invalid body", async () => {
    const input: UpdateDescriptionTask = {
        name: "UpdateDescription",
        flightId: "123"
    }
    const result = await initialiseUser(input)
    expect(result.success).toEqual(false)
})