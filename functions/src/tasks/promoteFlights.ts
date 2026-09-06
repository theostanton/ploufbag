import {
    Activities,
    ActivityRow,
    Flights as FlightsCommon,
    FlightRow,
    StravaAthleteId,
    Wing,
    Wings,
    extractWingName,
    isSuccess,
} from "@ploufbag/common";
import { StravaApi } from "@/stravaApi";
import { executeUpdateDescriptionTask } from "./updateDescription";
import { executeReconcileDescriptionTask } from "./reconcileDescription";
import { shapeOfActivity } from "./flightShape";

/**
 * Turning verdicts into flights.
 *
 * This is the half of the design that touches other people's Strava accounts, so
 * it deliberately ships after the screen that undoes it. Everything here is
 * reversible from /activities, including the description we write.
 *
 * Bounded per run. Each promotion costs two Strava requests -- a detail fetch
 * and a description write -- against a limit measured per fifteen minutes, so a
 * pilot with two hundred newly-found flights is several runs of work. The task
 * is safe to run repeatedly and picks up where it left off, because the work
 * list is "believed to be a flight, has no flight row" and that shrinks as it
 * goes.
 */

export type PromotionSummary = {
    promoted: number
    demoted: number
    remaining: number
    /**
     * Of those promoted, how many got their stats onto Strava.
     *
     * Reported because the alternative was believing it had happened. A run
     * that imported twenty-six flights and published none of them said
     * `+26 imported` and nothing else -- the failures were a log line in a
     * service nobody reads. A promotion that the pilot cannot see on Strava is
     * half a promotion, and the summary should say so.
     */
    described: number
    undescribed: number
    rateLimited: boolean
    /** Stopped because the request ran out of time, not because it ran out of work. */
    timedOut: boolean
}

/** How many flights one run will create. Two Strava requests each. */
const DEFAULT_BATCH = 40

/**
 * The wing named on the old 🪂 description line, if it names one we know.
 *
 * The convention still works, and is still the strongest signal there is: the
 * pilot said it themselves. It is no longer the only way in, which is the whole
 * point of everything above -- but a pilot who has been typing it for years
 * should find it still being read.
 */
function wingFromDescription(description: string, wings: Wing[]): Wing | null {
    const named = extractWingName(description)
    if (!named) {
        return null
    }
    // Same folding the wings table uses for identity: pilots type "Zeno 2",
    // "zeno2" and "Zeno  2" for one glider.
    const key = (value: string) => value.toLowerCase().replace(/\s+/g, '')
    const wanted = key(named)
    return wings.find(wing => key(wing.name) === wanted) ?? null
}

export async function promotePilotFlights(
    pilotId: StravaAthleteId,
    api: StravaApi,
    batch: number = DEFAULT_BATCH,
    deadline: number = Infinity
): Promise<{ summary?: PromotionSummary; error?: string }> {
    const promotable = await Activities.getPromotable(pilotId, batch)
    if (!isSuccess(promotable)) {
        return { error: `Activities.getPromotable failed: ${promotable[1]}` }
    }

    const wingsResult = await Wings.getForPilot(pilotId)
    const wings = isSuccess(wingsResult) ? wingsResult[0] : []

    let promoted = 0
    let described = 0
    let undescribed = 0
    let rateLimited = false
    let timedOut = false

    for (const activity of promotable[0]) {
        // Checked before the requests rather than after, so what stops is a
        // whole promotion and not one half-written. Same shape as the rate
        // limit below: the work list is untouched, `remaining` says there is
        // more, and the next run continues from here.
        if (Date.now() > deadline) {
            console.log(`Out of time after promoting ${promoted}; stopping`)
            timedOut = true
            break
        }

        const detail = await api.fetchActivity(activity.strava_activity_id)
        if (!isSuccess(detail)) {
            if (detail[1] === 'Rate limited') {
                // Stop cleanly rather than burning the rest of the batch on
                // requests that will all fail. The work list is unchanged, so
                // the next run continues from here.
                console.log(`Rate limited after promoting ${promoted}; stopping`)
                rateLimited = true
                break
            }
            console.log(`Could not fetch ${activity.strava_activity_id}: ${detail[1]}`)
            continue
        }

        const stravaActivity = detail[0]

        // Wing resolution, in the design's priority order: the 🪂 line the pilot
        // wrote, then their only wing, then the wing whose period covers the
        // date. Failing all three, the flight is created with no wing -- an
        // unattributed flight is a flight, where before it was one thrown away.
        let wing = wingFromDescription(stravaActivity.description ?? '', wings)
        if (!wing) {
            const resolved = await Wings.resolveForDate(pilotId, activity.start_date)
            wing = isSuccess(resolved) ? resolved[0] : null
        }

        // The flight, not the recording. The scan works from summaries and so
        // cannot know where the flying started; here there is a detail fetch in
        // hand already, and one more request buys the pilot a real airtime
        // instead of one that includes the walk down to the car.
        const shape = await shapeOfActivity(api, stravaActivity)
        if (shape.rateLimited) {
            console.log(`Rate limited after promoting ${promoted}; stopping`)
            rateLimited = true
            break
        }

        const flight: FlightRow = {
            pilot_id: pilotId,
            strava_activity_id: activity.strava_activity_id,
            wing: wing?.name ?? null,
            wing_id: wing?.wing_id ?? null,
            duration_sec: shape.durationSec,
            distance_meters: shape.distanceMeters,
            start_date: shape.startDate,
            description: stravaActivity.description ?? '',
            // The scan already stored the coarse track, which is better than
            // nothing when the detail endpoint gave us no geometry at all.
            polyline: shape.track ?? activity.polyline ?? [],
            takeoff_id: activity.takeoff_id ?? undefined,
            landing_id: activity.landing_id ?? undefined,
        }

        const upserted = await FlightsCommon.upsert([flight])
        if (!isSuccess(upserted)) {
            console.log(`Could not store flight ${activity.strava_activity_id}: ${upserted[1]}`)
            continue
        }
        promoted++

        // Written even when the wing is unknown. The stats and the back-link are
        // what the pilot came for; DescriptionFormatter omits the wing line
        // rather than publishing a blank one, and the next update fills it in
        // once they say which glider it was.
        //
        // Wrapped, because the flight above is already stored and a description
        // is the lesser half of the job. The failure path here was written for a
        // task that returns `{success: false}`, and said nothing about one that
        // throws -- so a single unexpected row took down the whole run: the
        // remaining promotions never happened, the summary never came back, and
        // the workflow saw a 500 rather than a count. One activity we cannot
        // describe is one line in the log.
        try {
            const written = await executeUpdateDescriptionTask({
                name: "UpdateDescription",
                flightId: activity.strava_activity_id,
            })
            if (written.success) {
                described++
            } else {
                undescribed++
                console.log(`Flight ${activity.strava_activity_id} stored but description not written: ${written.message}`)
            }
        } catch (error) {
            undescribed++
            console.log(`Flight ${activity.strava_activity_id} stored but describing it threw: ${error}`)
        }
    }

    // Flights whose activity we have since stopped believing in. Reachable
    // without anyone pressing anything: a pilot edits an activity on Strava and
    // the next scan changes its mind.
    let demoted = 0
    const demotable = await Activities.getDemotable(pilotId, batch)
    if (isSuccess(demotable)) {
        for (const activityId of demotable[0]) {
            if (Date.now() > deadline) {
                console.log(`Out of time after demoting ${demoted}; stopping`)
                timedOut = true
                break
            }
            const removed = await FlightsCommon.remove(pilotId, activityId)
            if (isSuccess(removed) && removed[0]) {
                demoted++
                // And take our text back off the Strava activity. Isolated for
                // the same reason as the write above: the flight is already
                // gone, and failing to tidy Strava must not lose the count of
                // what was removed.
                try {
                    await executeReconcileDescriptionTask({
                        name: "ReconcileDescription",
                        pilotId,
                        activityId,
                    })
                } catch (error) {
                    console.log(`Flight ${activityId} removed but cleaning Strava threw: ${error}`)
                }
            }
        }
    }

    const left = await Activities.getPromotable(pilotId, 1)
    const remaining = isSuccess(left) ? left[0].length : 0

    console.log(`Promotion for pilot ${pilotId}: +${promoted} flights ` +
        `(${described} described, ${undescribed} not), -${demoted}, more=${remaining > 0}`)

    return { summary: { promoted, described, undescribed, demoted, remaining, rateLimited, timedOut } }
}
