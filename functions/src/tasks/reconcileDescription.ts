import {
    Flights as FlightsCommon,
    ReconcileDescriptionTask,
    TaskResult,
    isSuccess,
    withoutStatsBlock,
} from "@ploufbag/common";
import { StravaApi } from "@/stravaApi";
import { executeUpdateDescriptionTask } from "./updateDescription";

/**
 * Makes a Strava activity's description match what we now believe about it.
 *
 * Runs in both directions, and the second one is why it exists. Writing stats
 * onto a flight is what the product has always done; taking them back off when a
 * pilot says "that was not a flight" is what makes saying so safe. Leaving our
 * text on somebody's Strava activity after we have stopped claiming it is a
 * flight is the kind of thing that costs an OAuth token.
 */
export async function executeReconcileDescriptionTask(
    task: ReconcileDescriptionTask
): Promise<TaskResult> {
    console.log(`Executing ReconcileDescription pilotId=${task.pilotId} activityId=${task.activityId}`);

    const exists = await FlightsCommon.exists(task.pilotId, task.activityId);
    if (!isSuccess(exists)) {
        return { success: false, message: `Flights.exists failed: ${exists[1]}` };
    }

    // Still a flight: the existing writer owns this side, including the
    // preferences and the aggregate lines. Delegating rather than reimplementing
    // keeps one description writer in the codebase.
    if (exists[0]) {
        return executeUpdateDescriptionTask({
            name: "UpdateDescription",
            flightId: task.activityId,
        });
    }

    const api = await StravaApi.fromUserId(task.pilotId);

    const activityResult = await api.fetchActivity(task.activityId);
    if (!isSuccess(activityResult)) {
        return {
            success: false,
            message: `Could not read activity ${task.activityId}: ${activityResult[1]}`,
        };
    }

    const description = activityResult[0].description ?? '';
    const cleaned = withoutStatsBlock(description);

    // Nothing of ours in there. Writing anyway would burn a rate-limited request
    // and touch a pilot's activity for no reason -- and touching it is exactly
    // what we are trying to undo.
    if (cleaned === description) {
        console.log(`Nothing of ours on activity ${task.activityId}, leaving it alone`);
        return { success: true };
    }

    const written = await api.updateDescription(task.activityId, cleaned);
    if (!isSuccess(written)) {
        return {
            success: false,
            message: `Could not clean description on ${task.activityId}: ${written[1]}`,
        };
    }

    console.log(`Removed our stats block from activity ${task.activityId}`);
    return { success: true };
}
