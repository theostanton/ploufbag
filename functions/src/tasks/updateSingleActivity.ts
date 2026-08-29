import {
    Activities,
    Flights as FlightsCommon,
    FlightRow,
    Sites,
    UpdateSingleActivityTask,
    TaskResult,
    Wings,
    classifyActivity,
    extractWingName,
    isSuccess,
    Pilots as PilotsCommon,
} from "@ploufbag/common";
import { Pilots } from '@/database/Pilots';
import { StravaApi } from '@/stravaApi';
import { StravaActivity } from "@/stravaApi/model";
import { executeUpdateDescriptionTask } from "./updateDescription";
import { executeReconcileDescriptionTask } from "./reconcileDescription";
import { shapeOfActivity } from "./flightShape";

/**
 * One activity, straight off a Strava webhook.
 *
 * The steady-state path, and by volume the one that runs most. What changes here
 * is that the answer is no longer binary: an activity that is not obviously a
 * flight is remembered as unsure rather than dropped, and a flight whose wing we
 * cannot work out is still created.
 *
 * Unlike the full scan, this does read the description -- there is one activity
 * and we are fetching it anyway -- so the 🪂 convention keeps working exactly as
 * it always did for the pilots who use it.
 */
export async function executeUpdateSingleActivityTask(
    task: UpdateSingleActivityTask
): Promise<TaskResult> {
    console.log(`Executing UpdateSingleActivity for pilotId=${task.pilotId}, activityId=${task.activityId}`);

    const pilotResult = await Pilots.get(task.pilotId);
    if (!isSuccess(pilotResult)) {
        return {
            success: false,
            message: `No pilot with id ${task.pilotId}: ${pilotResult[1]}`,
        };
    }
    const pilot = pilotResult[0];

    const api = await StravaApi.fromUserId(pilot.pilot_id);

    const activityResult = await api.fetchActivity(task.activityId);
    if (!isSuccess(activityResult)) {
        return {
            success: false,
            message: `Failed to fetch activity ${task.activityId}: ${activityResult[1]}`
        };
    }
    const stravaActivity: StravaActivity = activityResult[0];

    // The flight, rather than the recording: a vario started in the lift queue
    // and stopped at the bar has walking welded to both ends, and it is measured
    // off here so that everything below -- the verdict, the sites, the published
    // stats -- is about the part where the pilot was flying.
    const shape = await shapeOfActivity(api, stravaActivity)
    const track = shape.track
    const startPoint = shape.startPoint
    const endPoint = shape.endPoint

    const takeoff = startPoint ? await Sites.getNearestWithin(startPoint) : null
    const landing = endPoint ? await Sites.getNearestWithin(endPoint) : null

    const typesResult = await PilotsCommon.getFlightActivityTypes(pilot.pilot_id)
    const candidateTypes = isSuccess(typesResult) ? (typesResult[0] ?? []) : []

    const namedWing = extractWingName(stravaActivity.description)

    const classification = classifyActivity({
        type: stravaActivity.type,
        name: stravaActivity.name ?? '',
        distanceMeters: Math.round(stravaActivity.distance ?? 0),
        elapsedSec: stravaActivity.elapsed_time ?? 0,
        movingSec: stravaActivity.moving_time ?? null,
        totalElevationGain: stravaActivity.total_elevation_gain ?? null,
        startPoint,
        endPoint,
        hasTrack: track != null,
        takeoffSiteName: takeoff?.name ?? null,
        landingSiteName: landing?.name ?? null,
        wingFromDescription: namedWing,
        flown: shape.flown,
        candidateTypes,
    })

    const recorded = await Activities.upsertScanned([{
        strava_activity_id: task.activityId,
        pilot_id: pilot.pilot_id,
        type: stravaActivity.type,
        name: stravaActivity.name ?? '',
        start_date: new Date(stravaActivity.start_date),
        distance_meters: Math.round(stravaActivity.distance ?? 0),
        elapsed_sec: stravaActivity.elapsed_time ?? 0,
        moving_sec: stravaActivity.moving_time ?? null,
        total_elevation_gain: stravaActivity.total_elevation_gain ?? null,
        start_lat: startPoint?.[0] ?? null,
        start_lng: startPoint?.[1] ?? null,
        end_lat: endPoint?.[0] ?? null,
        end_lng: endPoint?.[1] ?? null,
        polyline: classification.verdict === 'not_flight' ? null : track,
        verdict: classification.verdict,
        score: classification.score,
        reasons: classification.reasons,
        takeoff_id: takeoff?.ffvl_sid ?? null,
        landing_id: landing?.ffvl_sid ?? null,
    }])
    if (!isSuccess(recorded)) {
        return { success: false, message: `Could not record activity: ${recorded[1]}` };
    }

    // This path read the description, which the history scan cannot. Saying so
    // is what stops the next scan -- working from a summary, and so blind to the
    // 🪂 line -- overwriting the verdict we just reached with a worse one.
    const noted = await Activities.markDescriptionChecked([task.activityId])
    if (!isSuccess(noted)) {
        console.log(`Could not record that ${task.activityId} has been read: ${noted[1]}`)
    }

    // What the pilot said beats what we think, including for an activity they
    // have already ruled on and then edited on Strava.
    const stored = await Activities.get(pilot.pilot_id, task.activityId)
    const effective = isSuccess(stored)
        ? (stored[0].pilot_verdict ?? stored[0].verdict)
        : classification.verdict

    if (effective !== 'flight') {
        // Not a flight, or not one we are sure enough about to act on. Anything
        // we previously created is removed, and anything we previously wrote to
        // Strava comes back off. Nothing is written for an activity we have not
        // confirmed.
        const removed = await FlightsCommon.remove(pilot.pilot_id, task.activityId)
        if (isSuccess(removed) && removed[0]) {
            await executeReconcileDescriptionTask({
                name: "ReconcileDescription",
                pilotId: pilot.pilot_id,
                activityId: task.activityId,
            })
        }
        console.log(`Activity ${task.activityId} is ${effective}; no flight created`);
        return { success: true };
    }

    // Wing resolution in the design's priority order: the 🪂 line, then the
    // pilot's only wing, then the wing whose period covers the date. All three
    // may fail, and an unattributed flight is still a flight.
    const wingsResult = await Wings.getForPilot(pilot.pilot_id)
    const wings = isSuccess(wingsResult) ? wingsResult[0] : []
    const key = (value: string) => value.toLowerCase().replace(/\s+/g, '')
    let wing = namedWing
        ? wings.find(candidate => key(candidate.name) === key(namedWing)) ?? null
        : null
    if (!wing) {
        const resolved = await Wings.resolveForDate(pilot.pilot_id, new Date(stravaActivity.start_date))
        wing = isSuccess(resolved) ? resolved[0] : null
    }

    // The published flight is the trimmed one. A pilot's airtime should not
    // include the walk to the landing field, and these are the numbers that end
    // up in their totals and on the Strava description.
    const flight: FlightRow = {
        pilot_id: pilot.pilot_id,
        strava_activity_id: task.activityId,
        wing: wing?.name ?? null,
        wing_id: wing?.wing_id ?? null,
        duration_sec: shape.durationSec,
        distance_meters: shape.distanceMeters,
        start_date: shape.startDate,
        description: stravaActivity.description ?? '',
        polyline: track ?? [],
        takeoff_id: takeoff?.ffvl_sid ?? undefined,
        landing_id: landing?.ffvl_sid ?? undefined,
    };

    const upsertResult = await FlightsCommon.upsert([flight]);
    if (!isSuccess(upsertResult)) {
        return {
            success: false,
            message: `Flights.upsert failed for activity ${task.activityId}: ${upsertResult[1]}`
        };
    }

    // Written even when the wing is unknown: the stats and the back-link are
    // what the pilot came for, and DescriptionFormatter omits the wing line
    // rather than publishing a blank one.
    const written = await executeUpdateDescriptionTask({
        name: "UpdateDescription",
        flightId: task.activityId,
    });
    if (!written.success) {
        console.log(`Flight ${task.activityId} stored but description not written: ${written.message}`);
    }

    console.log(`Successfully processed activity ${task.activityId} for pilot ${task.pilotId}`);
    return { success: true };
}
