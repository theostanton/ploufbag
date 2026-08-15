import {isSuccess} from "@ploufbag/common";
import { FetchAllActivitiesTask, TaskResult, StravaActivityId, StravaAthleteId, FlightRow } from '@ploufbag/common';
import { withPooledClient } from '@ploufbag/common';
import { Pilots } from '@/database/Pilots';
import { Flights } from '@/database/Flights';
import { StravaApi } from '@/stravaApi';
import { convertStravaActivityToFlight } from './utils/stravaConverter';
import {StravaActivity} from "@/stravaApi/model";

export async function executeFetchAllActivitiesTask(
    task: FetchAllActivitiesTask
): Promise<TaskResult> {
    console.log(`Executing FetchAllActivities for pilotId=${task.pilotId}`);

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

    // Get existing activity IDs from database
    const existingActivityIds: StravaActivityId[] = await withPooledClient(async (database) => {
        type ExistingStravaActivityId = Pick<FlightRow, 'strava_activity_id'>;
        console.log('Fetching existing activity IDs');
        const existingActivityIdsResult = await database.query(`
            select f.strava_activity_id as strava_activity_id
            from flights as f
            where pilot_id = $1
        `, [pilot.pilot_id]);
        console.log(`Fetched existingActivityIdsResult=${JSON.stringify(existingActivityIdsResult)}`);

        return [...existingActivityIdsResult].map(a => a.strava_activity_id);
    });

    // Fetch activities from Strava
    const paraglidingActivityIdsResult = await api.fetchParaglidingActivityIds(10_000, existingActivityIds);

    if (!isSuccess(paraglidingActivityIdsResult)) {
        return {
            success: false,
            message: `fetchParaglidingActivityIds failed: ${paraglidingActivityIdsResult[1]}`
        };
    }
    const paraglidingActivityIds: StravaActivityId[] = paraglidingActivityIdsResult[0];

    // Process paragliding activity IDs
    // 1. Fetch full Strava Activity
    // 2. Convert to FlightRow  
    // 3. Store to flights table
    const storedFlights: FlightRow[] = [];

    for (const activityId of paraglidingActivityIds) {
        try {
            const activityResult = await api.fetchActivity(activityId);
            if (!isSuccess(activityResult)) {
                console.log(`Failed to fetch activity ${activityId}: ${activityResult[1]}`);
                
                // Check for rate limiting
                if (activityResult[1] === 'Rate limited') {
                    const errorMessage = `Got rate limited after ${storedFlights.length} activities`;
                    console.log(errorMessage);
                    return {
                        success: false,
                        message: errorMessage,
                    };
                }
                continue;
            }
            
            const stravaActivity:StravaActivity = activityResult[0];

            const conversionResult = await convertStravaActivityToFlight(pilot.pilot_id, stravaActivity);
            if (isSuccess(conversionResult)) {
                const flightRow = conversionResult[0];
                const upsertResult = await Flights.upsert([flightRow]);
                if (!isSuccess(upsertResult)) {
                    return {
                        success: false,
                        message: `Flights.upsert failed for row=${JSON.stringify(flightRow)} error=${upsertResult[1]}`
                    };
                }
                storedFlights.push(flightRow);
                console.log(`Processed ${storedFlights.length}/${paraglidingActivityIds.length}`);
            } else {
                console.log(`Failed to convert activity id=${activityId} error=${conversionResult[1]}`);
            }
        } catch (error) {
            console.error(`Error processing activity ${activityId}:`, error);
            // Continue with next activity
        }
    }

    console.log(`Successfully processed ${storedFlights.length} activities for pilot ${task.pilotId}`);
    return {
        success: true
    };
}