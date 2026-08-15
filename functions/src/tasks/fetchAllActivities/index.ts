import {TaskBody, TaskResult} from "@/tasks/model";
import {StravaApi} from "@/stravaApi";
import {withPooledClient, Pilots, Flights, FlightRow, isSuccess} from "@ploufbag/common";
import {StravaActivity, StravaActivityId} from "@/stravaApi/model";
import axios, {AxiosHeaders} from "axios";
import {StravaActivityToFlightConverter} from "./StravaActivityToFlightConverter";


export type FetchAllActivitiesTask = {
    name: "FetchAllActivities";
    pilotId: number
}

function isFetchAllActivitiesTask(body: TaskBody): body is FetchAllActivitiesTask {
    return (body as FetchAllActivitiesTask).pilotId !== undefined;
}

export default async function (task: TaskBody): Promise<TaskResult> {
    if (!isFetchAllActivitiesTask(task)) {
        return {
            success: false,
            message: `Missing body information task=${JSON.stringify(task)}`
        }
    }

    console.log(`Gonna initialise pilot for pilotId=${task.pilotId}`)

    // Get pilot from database
    const pilotResult = await Pilots.get(task.pilotId)
    if (!isSuccess(pilotResult)) {
        return {
            success: false,
            message: `No pilot with id ${task.pilotId}`,
        }
    }
    const [pilot] = pilotResult

    const api = await StravaApi.fromUserId(pilot.pilot_id)

    // Get existing activity IDs from database
    const existingActivityIds: StravaActivityId[] = await withPooledClient(async (database) => {
        type ExistingStravaActivityId = Pick<FlightRow, 'strava_activity_id'>
        console.log('Gonna fetch existingActivityIds')
        const existingActivityIdsResult = await database.query<ExistingStravaActivityId>(`
            select f.strava_activity_id as strava_activity_id
            from flights as f
            where pilot_id = $1
        `, [pilot.pilot_id])
        console.log(`Fetched existingActivityIdsResult=${JSON.stringify(existingActivityIdsResult)}`)

        return [...existingActivityIdsResult].map(a => a.strava_activity_id);
    });

    // Fetch activities
    const paraglidingActivityIdsResult = await api.fetchParaglidingActivityIds(1000, existingActivityIds)

    if (!isSuccess(paraglidingActivityIdsResult)) {
        return {
            success: false,
            message: `fetchParaglidingActivityIds failed: ${paraglidingActivityIdsResult[1]}`
        }
    }
    const [paraglidingActivityIds] = paraglidingActivityIdsResult

    // Process paragliding activity IDs
    // 1. Fetch full Strava Activity
    // 2. Store to flights table
    const storedFlights: FlightRow[] = []

    const headers = new AxiosHeaders();
    headers.set('Authorization', `Bearer ${api.token}`);
    for (const activityId of paraglidingActivityIds) {
        const result = await axios.get<StravaActivity>(`https://www.strava.com/api/v3/activities/${activityId}`, {headers: headers});

        if (result.status == 429) {
            let errorMessage = `Got rate limited after ${storedFlights.length} activities`;
            console.log(errorMessage);
            return {
                success: false,
                message: errorMessage,
            }
        }

        const stravaActivity = result.data;
        const conversionResult = await StravaActivityToFlightConverter.convert(pilot.pilot_id, stravaActivity)
        if (isSuccess(conversionResult)) {
            const [flightRow] = conversionResult
            const upsertResult = await Flights.upsert([flightRow])
            if (!isSuccess(upsertResult)) {
                return {
                    success: false,
                    message: `Flights.upsert failed for row=${JSON.stringify(flightRow)} error=${upsertResult[1]}`
                }
            }
            storedFlights.push(flightRow)
            console.log(`Appended ${storedFlights.length}/${paraglidingActivityIds.length}`);
        } else {
            console.log(`Failed id=${stravaActivity.id} title=${stravaActivity.name} error=${conversionResult[1]}`);
        }
    }

    return {
        success: true
    }
}