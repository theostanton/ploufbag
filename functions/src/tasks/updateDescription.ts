import {
    isSuccess,
    UpdateDescriptionTask,
    TaskResult,
    StravaActivityId,
    FlightRow,
    isFormattedDescription,
    formattedStatsPattern
} from "@ploufbag/common";
import {Pilots} from '@/database/Pilots';
import {Flights} from '@/database/Flights';
import {StravaApi} from '@/stravaApi';
import {DescriptionFormatter} from './updateDescription/DescriptionFormatterAdapter';

export async function executeUpdateDescriptionTask(
    task: UpdateDescriptionTask
): Promise<TaskResult> {
    console.log(`Executing UpdateDescription for flightId=${task.flightId}`);

    // Fetch flight from database
    const [flight, flightError] = await Flights.get(task.flightId);
    if (flightError) {
        return {
            success: false,
            message: `No flight rows for flightId=${task.flightId}: ${flightError}`
        };
    }
    if (!flight) {
        return {
            success: false,
            message: `No flight rows for flightId=${task.flightId}: ${flightError}`
        };
    }

    // Generate description with preferences snapshot  
    const newStats = await DescriptionFormatter.generateDescription(flight);

    if (newStats === null) {
        console.log("Skipping because description is null");
        return {
            success: true,
        };
    }

    // Check if description is already formatted. Recognises legacy domains as well
    // as the current one — activities published before the ploufbag.com migration
    // still carry the old footer, and misreading those as unformatted would send
    // them down the append path below and give them a second stats block.
    const alreadyFormatted = isFormattedDescription(flight.description);

    // Generate the new description
    let updatedDescription: string;
    if (alreadyFormatted) {
        console.log("Updating existing formatted description");
        updatedDescription = flight.description.replace(formattedStatsPattern(), newStats);
    } else {
        console.log("Appending stats to description");
        updatedDescription = flight.description.replace(`🪂 ${flight.wing}`, newStats);
    }

    console.log('Updated description:');
    console.log(updatedDescription);
    console.log();

    // Nothing to say, so nothing is said.
    //
    // This is what makes it safe to run the whole pipeline again on a Strava
    // update event, including the events our own writes provoke: the second
    // pass computes the same text, stops here, and no further event is raised.
    // It also spares the rate limit a write per webhook on activities nobody
    // has touched since we last published them.
    if (updatedDescription === flight.description) {
        console.log(`Description for ${task.flightId} is already what we would publish; leaving it alone`);
        return {
            success: true
        };
    }

    // Update Strava activity description
    const [pilot, error] = await Pilots.get(flight.pilot_id);
    if (error) {
        return {
            success: false,
            message: `Couldn't get pilot for pilotId=${flight.pilot_id}: ${error}`
        };
    }

    const stravaApi = await StravaApi.fromUserId(pilot!!.pilot_id);
    const updateResult = await stravaApi.updateDescription(flight.strava_activity_id, updatedDescription);
    if (!isSuccess(updateResult)) {
        return {
            success: false,
            message: updateResult[1] || 'Failed to update Strava description'
        };
    }

    // Store updated description in database
    const dbUpdateResult = await Flights.updateDescription(
        task.flightId,
        updatedDescription
    );
    if (!isSuccess(dbUpdateResult)) {
        return {
            success: false,
            message: `Failed to update database: ${dbUpdateResult[1]}`
        };
    }

    console.log(`Successfully updated description for flight ${task.flightId}`);
    return {
        success: true
    };
}

