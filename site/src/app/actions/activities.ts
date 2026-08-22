'use server'

import { Auth } from "@auth/index";
import {
    Activities,
    Flights,
    Wings,
    isSuccess,
    type ActivityRow,
    type ActivityVerdict,
    type FlightRow,
    type StravaActivityId,
    type StravaAthleteId,
} from "@ploufbag/common";
import { revalidatePath } from 'next/cache';
import { actionError, actionOk, type ActionResult } from "@model/ActionResult";
import { triggerTask } from "@actions/tasks";

/**
 * Correcting what we decided about a Strava activity.
 *
 * The pilot's answer is written to `activities.pilot_verdict` and the flights
 * table is then made to agree with it. Both halves matter: the verdict is the
 * durable decision that survives the next scan, and the flight row is what the
 * pilot can actually see on the map a second later.
 */

function revalidateActivityViews() {
    revalidatePath('/activities')
    revalidatePath('/dashboard')
    revalidatePath('/flights')
    revalidatePath('/api/geo/flights')
}

/**
 * Asks the backend to make Strava match. Best effort, on purpose.
 *
 * The decision is already recorded in our own database by the time this runs, so
 * a queue that is down must not make the button fail -- the pilot's answer is
 * not less true because Strava has not caught up. Stage 5 is where this stops
 * being fire-and-forget.
 */
async function queueReconcile(pilotId: StravaAthleteId, activityIds: StravaActivityId[]) {
    for (const activityId of activityIds) {
        try {
            await triggerTask({ name: 'ReconcileDescription', pilotId, activityId })
        } catch (error) {
            console.error(`Could not queue ReconcileDescription for ${activityId}:`, error)
        }
    }
}

/** The flight row an activity becomes when a pilot confirms it. */
function flightFromActivity(activity: ActivityRow, wing: { wing_id: string, name: string } | null): FlightRow {
    return {
        pilot_id: activity.pilot_id,
        strava_activity_id: activity.strava_activity_id,
        wing: wing?.name ?? null,
        wing_id: wing?.wing_id ?? null,
        duration_sec: activity.elapsed_sec,
        distance_meters: activity.distance_meters,
        start_date: activity.start_date,
        // The description column holds whatever was on the Strava activity when
        // it was imported. We have not fetched it -- that is the per-activity
        // request the scan exists to avoid -- and the column is `not null`, so
        // it starts empty and the reconcile task fills Strava's side in.
        description: '',
        polyline: activity.polyline ?? [],
        takeoff_id: activity.takeoff_id ?? undefined,
        landing_id: activity.landing_id ?? undefined,
    }
}

/**
 * Makes the flights table agree with what each activity is now believed to be.
 *
 * Reads the *effective* verdict, so it does the right thing for an undo as well
 * as a decision: clearing a pilot's "not a flight" hands the activity back to
 * the classifier, and if the classifier says flight, the flight comes back.
 */
async function syncFlightsToVerdicts(
    pilotId: StravaAthleteId,
    activityIds: StravaActivityId[]
): Promise<{ created: number; removed: number; touched: StravaActivityId[] }> {
    let created = 0
    let removed = 0
    const touched: StravaActivityId[] = []

    for (const activityId of activityIds) {
        const found = await Activities.get(pilotId, activityId)
        if (!isSuccess(found)) {
            console.error(`syncFlightsToVerdicts: no activity ${activityId}: ${found[1]}`)
            continue
        }
        const activity = found[0]
        const effective: ActivityVerdict = activity.pilot_verdict ?? activity.verdict

        const exists = await Flights.exists(pilotId, activityId)
        if (!isSuccess(exists)) {
            console.error(`syncFlightsToVerdicts: Flights.exists failed: ${exists[1]}`)
            continue
        }

        if (effective === 'flight' && !exists[0]) {
            // An unknown wing is a legal, permanent state -- the flight is worth
            // having on the map whether or not we can say what it was flown on.
            const resolved = await Wings.resolveForDate(pilotId, activity.start_date)
            const wing = isSuccess(resolved) ? resolved[0] : null

            const upserted = await Flights.upsert([flightFromActivity(activity, wing)])
            if (isSuccess(upserted)) {
                created++
                touched.push(activityId)
            } else {
                console.error(`syncFlightsToVerdicts: upsert failed: ${upserted[1]}`)
            }
        } else if (effective !== 'flight' && exists[0]) {
            const deleted = await Flights.remove(pilotId, activityId)
            if (isSuccess(deleted)) {
                removed++
                touched.push(activityId)
            } else {
                console.error(`syncFlightsToVerdicts: remove failed: ${deleted[1]}`)
            }
        }
    }

    return { created, removed, touched }
}

/**
 * Records the pilot's decision about some activities.
 *
 * `null` clears the decision rather than setting one, which is what undo means:
 * the activity goes back to the classifier's verdict instead of freezing a guess
 * into a decision nobody made.
 */
export async function setActivityVerdict(
    activityIds: string[],
    verdict: ActivityVerdict | null
): Promise<ActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    if (activityIds.length === 0) {
        return actionError('Nothing selected')
    }

    const written = await Activities.setPilotVerdict(pilotId, activityIds, verdict)
    if (!isSuccess(written)) {
        return actionError(written[1])
    }

    const { created, removed, touched } = await syncFlightsToVerdicts(pilotId, activityIds)
    await queueReconcile(pilotId, touched)

    revalidateActivityViews()

    const count = activityIds.length
    const plural = count === 1 ? '' : 's'

    if (verdict === 'flight') {
        return actionOk(`${count} flight${plural} added`)
    }
    if (verdict === 'not_flight') {
        return actionOk(
            removed > 0
                ? `${count} activit${count === 1 ? 'y' : 'ies'} set aside. ${removed} flight${removed === 1 ? '' : 's'} removed, and the stats we wrote to Strava taken back off.`
                : `${count} activit${count === 1 ? 'y' : 'ies'} set aside`
        )
    }
    if (verdict === null) {
        return actionOk(created > 0 || removed > 0 ? 'Undone' : 'Back to what we thought')
    }
    return actionOk(`${count} activit${count === 1 ? 'y' : 'ies'} updated`)
}

/** Sets, or clears, the wing on some flights. */
export async function setFlightWing(
    flightIds: string[],
    wingId: string | null
): Promise<ActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    if (flightIds.length === 0) {
        return actionError('Nothing selected')
    }

    const result = await Flights.setWing(pilotId, flightIds, wingId)
    if (!isSuccess(result)) {
        return actionError(result[1])
    }

    // The wing appears in the Strava description, so changing it means what is
    // published is now out of date.
    await queueReconcile(pilotId, flightIds)
    revalidateActivityViews()

    const count = result[0]
    if (count === 0) {
        return actionError('That wing is not one of yours')
    }
    return actionOk(
        wingId === null
            ? `Wing cleared on ${count} flight${count === 1 ? '' : 's'}`
            : `${count} flight${count === 1 ? '' : 's'} updated`
    )
}
