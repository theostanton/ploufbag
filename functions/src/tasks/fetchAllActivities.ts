import { Activities, isSuccess } from "@ploufbag/common";
import { FetchAllActivitiesTask, TaskResult } from '@ploufbag/common';
import { Pilots } from '@/database/Pilots';
import { StravaApi } from '@/stravaApi';
import { scanPilotActivities } from './scanActivities';
import { republishMissingDescriptions } from './republishDescriptions';
import { promotePilotFlights } from './promoteFlights';

/**
 * Read a pilot's whole Strava history and make our flights match it.
 *
 * Two phases, and the split is the point.
 *
 * The scan reads every activity from Strava's *list* endpoint -- two requests
 * for a three-hundred activity history -- and records a verdict for each one.
 * The promotion then pays the expensive per-activity cost only for activities
 * that are already believed to be flights.
 *
 * What this replaced fetched every candidate individually before it knew whether
 * it was a flight, because the only way to tell was a 🪂 line the pilot had
 * typed into the description by hand -- and anything without one was discarded
 * into a log nobody read. That single line of code is why pilots had to
 * hand-annotate their entire history before this product could do anything for
 * them.
 *
 * Safe to re-run, and expected to be: promotion is bounded per run so that a
 * pilot with two hundred newly-found flights does not exhaust Strava's fifteen
 * minute budget in one go.
 */

/**
 * How long one call gets before it stops and asks to be called again.
 *
 * The tasks service is given 540 seconds (infra/function.tasks.tf) and a
 * request that overruns is killed by Cloud Run, which returns a 504 and throws
 * away the summary -- so the caller cannot tell what was done, or that anything
 * was. That is exactly how the first real sync of a twelve year history ended.
 *
 * Stopping ourselves instead turns that into an ordinary outcome: whatever was
 * promoted stays promoted, `remaining` says there is more, and the caller comes
 * back. The margin covers the counting queries after the loops and the response
 * itself; overshooting the budget by a few seconds must still land inside the
 * platform's.
 */
const BUDGET_MS = 420_000

export async function executeFetchAllActivitiesTask(
    task: FetchAllActivitiesTask
): Promise<TaskResult> {
    console.log(`Executing FetchAllActivities for pilotId=${task.pilotId}`);

    const pilotResult = await Pilots.get(task.pilotId);
    if (!isSuccess(pilotResult)) {
        return {
            success: false,
            message: `No pilot with id ${task.pilotId}: ${pilotResult[1]}`,
        };
    }
    const pilot = pilotResult[0];

    const api = await StravaApi.fromUserId(pilot.pilot_id);

    const deadline = Date.now() + BUDGET_MS;

    const scan = await scanPilotActivities(pilot.pilot_id, api, 10_000, deadline);
    if (scan.error) {
        return { success: false, message: `Scan failed: ${scan.error}` };
    }

    if (task.dryRun) {
        console.log(`FetchAllActivities for ${task.pilotId}: dry run, nothing promoted`);
        return {
            success: true,
            summary: {
                dryRun: true,
                scanned: scan.summary?.scanned ?? 0,
                flight: scan.summary?.flight ?? 0,
                unsure: scan.summary?.unsure ?? 0,
                not_flight: scan.summary?.not_flight ?? 0,
                reviewed: scan.summary?.reviewed ?? 0,
                reconsidered: scan.summary?.reconsidered ?? 0,
                promoted: 0,
                described: 0,
                undescribed: 0,
                republished: 0,
                nothingToPublish: 0,
                unpublishable: 0,
                demoted: 0,
                // Nothing was promoted, so nothing is left to come back for.
                remaining: 0,
                rateLimited: false,
                // Reported here too, or a dry run that was cut short reads
                // exactly like one that finished -- and a scan that never
                // reached the older half of a history is the thing a dry run
                // exists to tell you about.
                timedOut: Date.now() > deadline,
            },
        };
    }

    // A scan that used the whole budget leaves no room to promote anything, and
    // starting anyway is how a run gets killed halfway through writing to
    // somebody's Strava account. Report the scan and let the caller come back.
    if (Date.now() > deadline) {
        const left = await Activities.getPromotable(pilot.pilot_id, 1);
        console.log(`FetchAllActivities for ${task.pilotId}: out of time after the scan`);
        return {
            success: true,
            summary: {
                scanned: scan.summary?.scanned ?? 0,
                flight: scan.summary?.flight ?? 0,
                unsure: scan.summary?.unsure ?? 0,
                not_flight: scan.summary?.not_flight ?? 0,
                reviewed: scan.summary?.reviewed ?? 0,
                reconsidered: scan.summary?.reconsidered ?? 0,
                promoted: 0,
                described: 0,
                undescribed: 0,
                republished: 0,
                nothingToPublish: 0,
                unpublishable: 0,
                demoted: 0,
                remaining: isSuccess(left) ? left[0].length : 0,
                rateLimited: false,
                timedOut: true,
            },
        };
    }

    const promotion = await promotePilotFlights(pilot.pilot_id, api, undefined, deadline);
    if (promotion.error) {
        return { success: false, message: `Promotion failed: ${promotion.error}` };
    }

    const summary = promotion.summary!;

    // Rate limiting is an ordinary outcome here, not a failure: the work list is
    // untouched and the next run continues from where this one stopped. Failing
    // the task would have Cloud Tasks retry it immediately, into the same limit.
    if (summary.rateLimited) {
        console.log(`FetchAllActivities for ${task.pilotId} paused on Strava's rate limit`);
    }

    // Flights that carry no stats of ours, whenever they were imported.
    //
    // Promotion writes a description once and never revisits it, so a flight
    // created while the writer was broken is bare for ever -- and the twenty-six
    // imported by the run that published nothing were exactly that: already
    // promoted, so the pass that describes flights had no work left to find.
    // Sharing the deadline means this yields to the clock like everything else.
    const republishing = await republishMissingDescriptions(pilot.pilot_id, undefined, deadline);
    if (republishing.error) {
        // Not a failure of the task: the flights are imported either way, and
        // saying so beats discarding a summary that reports real work done.
        console.log(`Republishing descriptions failed: ${republishing.error}`);
    }
    const republish = republishing.summary
        ?? { republished: 0, skipped: 0, failed: 0, remaining: 0, timedOut: false };

    console.log(`FetchAllActivities for ${task.pilotId}: ` +
        `scanned ${scan.summary?.scanned}, promoted ${summary.promoted}, ` +
        `demoted ${summary.demoted}, republished ${republish.republished}, ` +
        `more to do: ${summary.remaining + republish.remaining > 0}`);

    // Returned rather than only logged, so a caller can see what happened and
    // decide whether to run it again. `remaining` is the one that matters:
    // promotion is batched, so a backlog needs several runs and nothing outside
    // this function could previously tell.
    return {
        success: true,
        summary: {
            scanned: scan.summary?.scanned ?? 0,
            flight: scan.summary?.flight ?? 0,
            unsure: scan.summary?.unsure ?? 0,
            not_flight: scan.summary?.not_flight ?? 0,
            reviewed: scan.summary?.reviewed ?? 0,
            reconsidered: scan.summary?.reconsidered ?? 0,
            promoted: summary.promoted,
            demoted: summary.demoted,
            described: summary.described,
            undescribed: summary.undescribed,
            republished: republish.republished,
            nothingToPublish: republish.skipped,
            unpublishable: republish.failed,
            remaining: summary.remaining + republish.remaining,
            rateLimited: summary.rateLimited,
            timedOut: summary.timedOut || republish.timedOut,
        },
    };
}
