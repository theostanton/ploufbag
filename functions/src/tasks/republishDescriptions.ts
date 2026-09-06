import { Flights, StravaAthleteId, isSuccess } from "@ploufbag/common";
import { executeUpdateDescriptionTask } from "./updateDescription";

/**
 * Putting stats onto flights that never got any.
 *
 * Publishing has always been tied to promotion: the description is written once,
 * in the loop that creates the flight, and nothing goes back. That is fine while
 * the writer works and leaves no way to recover when it does not -- and it did
 * not. A sync imported twenty-six flights while the writer was silently
 * publishing nothing; by the time that was fixed the flights existed, so the
 * only pass that would have described them had no work left to find. The
 * descriptions were unreachable by any button in the product.
 *
 * So this asks the question promotion cannot: which of this pilot's flights
 * carry no block of ours? It is the same writer, on a work list that shrinks as
 * it goes, and it is safe to run on every sync because a flight that already has
 * a footer is not in the list.
 */

export type RepublishSummary = {
    /** Flights that now carry stats they did not before. */
    republished: number
    /** Tried and could not -- see the log for each. */
    failed: number
    /** Still bare after this run, so the caller knows to come back. */
    remaining: number
    timedOut: boolean
}

/**
 * How many to publish in one run. One Strava write each, against a limit counted
 * per fifteen minutes and shared with the promotion pass that runs first.
 */
const DEFAULT_BATCH = 40

export async function republishMissingDescriptions(
    pilotId: StravaAthleteId,
    batch: number = DEFAULT_BATCH,
    deadline: number = Infinity
): Promise<{ summary?: RepublishSummary; error?: string }> {
    const bare = await Flights.getUndescribed(pilotId, batch)
    if (!isSuccess(bare)) {
        return { error: `Flights.getUndescribed failed: ${bare[1]}` }
    }

    let republished = 0
    let failed = 0
    let timedOut = false

    for (const activityId of bare[0]) {
        if (Date.now() > deadline) {
            console.log(`Out of time after republishing ${republished}; stopping`)
            timedOut = true
            break
        }

        try {
            const written = await executeUpdateDescriptionTask({
                name: "UpdateDescription",
                flightId: activityId,
            })
            if (written.success) {
                republished++
            } else {
                failed++
                console.log(`Could not publish stats onto ${activityId}: ${written.message}`)
            }
        } catch (error) {
            // Same isolation as the promotion loop: one activity we cannot
            // describe costs one activity.
            failed++
            console.log(`Publishing stats onto ${activityId} threw: ${error}`)
        }
    }

    // Asked again afterwards rather than subtracted, because a flight we failed
    // to publish is still bare and should still be counted as work left. That
    // does mean a permanently unpublishable flight keeps `remaining` above zero;
    // the caller's round cap bounds it, and `failed` says why it is happening
    // rather than leaving it to look like progress that never arrives.
    const left = await Flights.getUndescribed(pilotId, batch)
    const remaining = isSuccess(left) ? left[0].length : 0

    if (republished > 0 || failed > 0) {
        console.log(`Republished ${republished} descriptions for pilot ${pilotId}, ` +
            `${failed} failed, ${remaining} still bare`)
    }

    return { summary: { republished, failed, remaining, timedOut } }
}
