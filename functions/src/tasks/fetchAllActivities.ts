import { isSuccess } from "@ploufbag/common";
import { FetchAllActivitiesTask, TaskResult } from '@ploufbag/common';
import { Pilots } from '@/database/Pilots';
import { StravaApi } from '@/stravaApi';
import { scanPilotActivities } from './scanActivities';
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

    const scan = await scanPilotActivities(pilot.pilot_id, api);
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
                demoted: 0,
                // Nothing was promoted, so nothing is left to come back for.
                remaining: 0,
                rateLimited: false,
            },
        };
    }

    const promotion = await promotePilotFlights(pilot.pilot_id, api);
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

    console.log(`FetchAllActivities for ${task.pilotId}: ` +
        `scanned ${scan.summary?.scanned}, promoted ${summary.promoted}, ` +
        `demoted ${summary.demoted}, more to do: ${summary.remaining > 0}`);

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
            remaining: summary.remaining,
            rateLimited: summary.rateLimited,
        },
    };
}
