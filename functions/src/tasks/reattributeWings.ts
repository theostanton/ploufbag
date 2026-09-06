import {
    Flights,
    StravaAthleteId,
    Wings,
    isSuccess,
    wingNameFromDescription,
} from "@ploufbag/common";
import { executeUpdateDescriptionTask } from "./updateDescription";

/**
 * Giving a wing back to flights whose own description already named one.
 *
 * The same shape of hole as the republish pass, one layer down. Promotion
 * resolves the wing once, in the loop that creates the flight, and nothing goes
 * back -- so when the resolver could only match names it already had a row for,
 * every flight naming a glider we had never heard of imported unattributed and
 * stayed that way. The site said "Unknown wing", the stats block we published
 * carried no 🪂 line, and the pilot's own word for their own glider was sitting
 * in the description the whole time.
 *
 * Wings.ensureNamed closes that for new imports. This is the part that cannot
 * fix itself: those flights are already promoted, so the only pass that would
 * have attributed them has no work left to find. It asks the question promotion
 * cannot -- which of this pilot's flights have no wing but name one? -- and it
 * is safe on every sync, because a flight that has a wing is not in the list.
 *
 * Bounded like everything that touches Strava: a batch, and the round's
 * deadline. Attribution alone is a database write, but a flight that gains a
 * wing has a stats block that is now wrong -- it is missing the 🪂 line -- so
 * each repair is followed by the same description writer promotion uses, which
 * is one Strava write against a fifteen-minute budget shared with the two passes
 * either side of this one.
 */

export type ReattributionSummary = {
    /** Flights that now have a wing. Writes, not calls. */
    attributed: number
    /** Wings that did not exist until this pass read a description. */
    created: number
    /**
     * Of those attributed, how many got the corrected block onto Strava.
     *
     * Apart from `attributed`, because they fail independently: the row is
     * fixed the moment the wing is set, and a Strava write that fails after it
     * must not make the repair look undone. The site is right either way; this
     * number is about whether the pilot's activity is too.
     */
    republished: number
    /**
     * Offered by the query and declined by the reader.
     *
     * The number that says the pass is stuck rather than slow. A skipped flight
     * is unchanged, so it comes back next round and the round after -- the
     * treadmill the republish pass was reporting as progress. It should be zero:
     * the SQL predicate is deliberately wider than the parser and
     * normaliseWingName truncates rather than refuses, so a name that reaches
     * here is a name we store. A non-zero count is a bug, and this is where it
     * becomes visible instead of inferrable from a backlog that will not move.
     */
    skipped: number
    /** Tried and could not -- see the log for each. */
    failed: number
    /** Still unattributed but naming a wing, so the caller knows to come back. */
    remaining: number
    timedOut: boolean
}

/**
 * How many to repair in one run. One Strava write each, against a limit counted
 * per fifteen minutes and shared with the promotion and republish passes.
 */
const DEFAULT_BATCH = 40

export async function reattributeNamedWings(
    pilotId: StravaAthleteId,
    batch: number = DEFAULT_BATCH,
    deadline: number = Infinity
): Promise<{ summary?: ReattributionSummary; error?: string }> {
    const candidates = await Flights.getUnattributedNamingAWing(pilotId, batch)
    if (!isSuccess(candidates)) {
        return { error: `Flights.getUnattributedNamingAWing failed: ${candidates[1]}` }
    }

    let attributed = 0
    let created = 0
    let republished = 0
    let skipped = 0
    let failed = 0
    let timedOut = false

    for (const flight of candidates[0]) {
        // Before the writes rather than after, so what stops is a whole repair
        // and not one half-done. Same shape as the promotion loop: the work list
        // is untouched, `remaining` says there is more, the next run continues.
        if (Date.now() > deadline) {
            console.log(`Out of time after attributing ${attributed}; stopping`)
            timedOut = true
            break
        }

        // Isolated per flight, for the reason #42 was written: one activity we
        // cannot repair has to cost one activity, not the rest of the batch and
        // the summary with it.
        try {
            const named = wingNameFromDescription(flight.description)
            if (!named) {
                skipped++
                console.log(`No wing name in the description of ${flight.strava_activity_id}`)
                continue
            }

            const ensured = await Wings.ensureNamed(pilotId, named)
            if (!isSuccess(ensured)) {
                failed++
                console.log(`Could not settle wing "${named}" for ${flight.strava_activity_id}: ${ensured[1]}`)
                continue
            }
            if (ensured[0].created) {
                created++
                console.log(`Created wing "${ensured[0].wing.name}" for pilot ${pilotId}`)
            }

            const set = await Flights.setWing(pilotId, [flight.strava_activity_id], ensured[0].wing.wing_id)
            if (!isSuccess(set)) {
                failed++
                console.log(`Could not attribute ${flight.strava_activity_id}: ${set[1]}`)
                continue
            }
            if (set[0] === 0) {
                // The update matched nothing. Not an error we can act on here,
                // but it is also not a repair, and counting it as one would be
                // the same lie the republish pass used to tell.
                failed++
                console.log(`Attributing ${flight.strava_activity_id} changed no rows`)
                continue
            }
            attributed++

            // The block on Strava is now missing a line it should have. Written
            // here rather than left to the republish pass, which only looks for
            // flights carrying no block at all and would never offer this one.
            const written = await executeUpdateDescriptionTask({
                name: "UpdateDescription",
                flightId: flight.strava_activity_id,
            })
            if (written.success) {
                if ((written.summary as { published?: boolean } | undefined)?.published) {
                    republished++
                }
            } else {
                console.log(`Attributed ${flight.strava_activity_id} but its description was not rewritten: ${written.message}`)
            }
        } catch (error) {
            failed++
            console.log(`Attributing ${flight.strava_activity_id} threw: ${error}`)
        }
    }

    // Counted, not subtracted: a flight we failed on is still unattributed and
    // is still work, and a page length can never exceed the batch it was given.
    const left = await Flights.countUnattributedNamingAWing(pilotId)
    const remaining = isSuccess(left) ? left[0] : 0

    if (attributed > 0 || skipped > 0 || failed > 0) {
        console.log(`Attributed ${attributed} flights for pilot ${pilotId} ` +
            `(${created} new wings, ${republished} descriptions rewritten), ` +
            `${skipped} named nothing usable, ${failed} failed, ${remaining} still unattributed`)
    }

    return { summary: { attributed, created, republished, skipped, failed, remaining, timedOut } }
}
