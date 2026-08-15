import {isSuccess} from "@ploufbag/common";
import {UpdateSingleActivityTask, TaskResult} from '@ploufbag/common';
import {Pilots} from '@/database/Pilots';
import {Flights} from '@/database/Flights';
import {StravaApi} from '@/stravaApi';
import {convertStravaActivityToFlight} from './utils/stravaConverter';
import {StravaActivity, isRelevantActivityType} from "@/stravaApi/model";

export async function executeUpdateSingleActivityTask(
    task: UpdateSingleActivityTask
): Promise<TaskResult> {
    console.log(`Executing UpdateSingleActivity for pilotId=${task.pilotId}, activityId=${task.activityId}`);

    // Get pilot from database
    const pilotResult = await Pilots.get(task.pilotId);
    if (!isSuccess(pilotResult)) {
        return {
            success: false,
            message: `No pilot with id ${task.pilotId}: ${pilotResult[1]}`,
        };
    }
    const pilot = pilotResult[0];

    // Create Strava API instance
    const api = await StravaApi.fromUserId(pilot.pilot_id);

    // Fetch single activity from Strava
    const activityResult = await api.fetchActivity(task.activityId);
    if (!isSuccess(activityResult)) {
        return {
            success: false,
            message: `Failed to fetch activity ${task.activityId}: ${activityResult[1]}`
        };
    }

    const stravaActivity: StravaActivity = activityResult[0];

    // Check if this activity type should be imported as a flight
    if (!isRelevantActivityType(stravaActivity.type)) {
        console.log(`Skipping activity ${task.activityId} with type '${stravaActivity.type}' - not a paragliding activity`);
        return {
            success: true
        };
    }

    // Convert Strava activity to flight
    const conversionResult = await convertStravaActivityToFlight(pilot.pilot_id, stravaActivity);
    if (!isSuccess(conversionResult)) {
        return {
            success: false,
            message: `Failed to convert activity ${task.activityId}: ${conversionResult[1]}`
        };
    }

    const flightRow = conversionResult[0];

    // Upsert to database
    const upsertResult = await Flights.upsert([flightRow]);
    if (!isSuccess(upsertResult)) {
        return {
            success: false,
            message: `Flights.upsert failed for activity ${task.activityId}: ${upsertResult[1]}`
        };
    }

    console.log(`Successfully processed activity ${task.activityId} for pilot ${task.pilotId}`);
    return {
        success: true
    };
}
