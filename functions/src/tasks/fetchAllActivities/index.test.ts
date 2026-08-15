import {expect, test} from "vitest";
import initialiseUser, {FetchAllActivitiesTask} from "./index";
import {TestContainer} from "../../model/database/generateContainer.test";
import {end} from "../../model/database/client";

// Needs a database even though it asserts failure: the task reaches for the
// pilot through the connection pool, so without a container it hung until
// generic-pool's 10s acquire timeout rather than returning a task failure.
test("fetchAllActivities fails for an unknown pilot", async () => {
    const container = await TestContainer.generateEmpty()

    const input: FetchAllActivitiesTask = {
        name: "FetchAllActivities",
        pilotId: 123,
    }
    const result = await initialiseUser(input)
    expect(result.success).toEqual(false)

    await end()
    await container?.stop()
})