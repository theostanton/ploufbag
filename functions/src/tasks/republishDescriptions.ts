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
    /** Flights that now carry stats they did not before. Writes, not calls. */
    republished: number
    /**
     * Asked for, and the writer had nothing to publish.
     *
     * Counted apart from the two outcomes either side of it because it is the
     * only one that does not move: the flight was bare when we picked it up and
     * is bare now, so it comes back next round and the round after. A pass that
     * reports nothing but skips is not slow, it is stuck, and the number that
     * says so should be on the summary rather than inferred from a backlog that
     * will not go down.
     */
    skipped: number
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
    let skipped = 0
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
                // `success` alone means "nothing went wrong", which includes
                // having nothing to publish. Only the write itself counts.
                if ((written.summary as { published?: boolean } | undefined)?.published) {
                    republished++
                } else {
                    skipped++
                    console.log(`Nothing to publish onto ${activityId}: ` +
                        `${(written.summary as { reason?: string } | undefined)?.reason ?? 'unknown'}`)
                }
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

    // Counted rather than subtracted, because a flight we failed to publish is
    // still bare and is still work. Counted properly, too: this used to be the
    // length of another `getUndescribed(pilot, batch)`, which cannot exceed the
    // batch, so four hundred left and forty left both read as forty and no
    // number on the summary could distinguish progress from a treadmill.
    const left = await Flights.countUndescribed(pilotId)
    const remaining = isSuccess(left) ? left[0] : 0

    if (republished > 0 || skipped > 0 || failed > 0) {
        console.log(`Republished ${republished} descriptions for pilot ${pilotId}, ` +
            `${skipped} had nothing to publish, ${failed} failed, ${remaining} still bare`)
    }

    return { summary: { republished, skipped, failed, remaining, timedOut } }
}
