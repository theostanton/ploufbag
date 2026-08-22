import {StravaActivityId, StravaAthleteId} from "@ploufbag/common";

/**
 * What the site is allowed to ask the tasks service to do.
 *
 * This used to declare a single "WingActivity" task that no handler has ever
 * implemented -- a leftover from an earlier shape of the product. Replaced
 * rather than extended.
 */
export type TaskBody = ReconcileDescriptionTask

/**
 * Make a Strava activity's description match what we now believe about it:
 * write the stats block if it is a flight, take ours back off if it is not.
 */
export type ReconcileDescriptionTask = {
    name: "ReconcileDescription";
    pilotId: StravaAthleteId;
    activityId: StravaActivityId;
}
