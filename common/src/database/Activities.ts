import {
    Either,
    Polyline,
    StravaActivityId,
    StravaAthleteId,
    failure,
    success,
} from '../model';
import { ActivityVerdict, ClassificationReason } from '../classify';
import { withPooledClient, Client } from '../database';

/** One scanned Strava activity, and what we make of it. */
export type ActivityRow = {
    strava_activity_id: StravaActivityId
    pilot_id: StravaAthleteId
    type: string
    name: string
    start_date: Date
    distance_meters: number
    elapsed_sec: number
    moving_sec: number | null
    total_elevation_gain: number | null
    start_lat: number | null
    start_lng: number | null
    end_lat: number | null
    end_lng: number | null
    polyline: Polyline | null
    verdict: ActivityVerdict
    score: number
    reasons: ClassificationReason[]
    takeoff_id: string | null
    landing_id: string | null
    pilot_verdict: ActivityVerdict | null
}

/** What a scan produces. The pilot's own verdict is never part of it. */
export type ScannedActivity = Omit<ActivityRow, 'pilot_verdict'>

/**
 * Keyed by ActivityVerdict rather than spelled out, so adding a verdict is a
 * compile error here rather than a silently missing count on the screen.
 */
export type VerdictCounts = Record<ActivityVerdict, number>

/** An activity type the pilot uses, and how often. For the empty state. */
export type ActivityTypeCount = {
    type: string
    activities: number
}

/**
 * The record of every Strava activity we have looked at.
 *
 * The column that makes this table worth having is `pilot_verdict`. A scan
 * writes `verdict`; only a person writes `pilot_verdict`; and every read takes
 * the pilot's answer over ours. Without that, re-running a scan with better
 * thresholds would quietly promote back everything somebody had already
 * rejected — which is the one behaviour an automated system that guesses must
 * never have.
 */
export namespace Activities {

    /** The pilot's answer, or failing that, ours. */
    const EFFECTIVE = `coalesce(pilot_verdict, verdict)`

    const COLUMNS = `
        strava_activity_id,
        pilot_id,
        type,
        name,
        start_date,
        distance_meters,
        elapsed_sec,
        moving_sec,
        total_elevation_gain,
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        polyline,
        verdict,
        score,
        reasons,
        takeoff_id,
        landing_id,
        pilot_verdict
    `

    /**
     * Records what a scan concluded, leaving the pilot's own decision alone.
     *
     * The `do update` list deliberately omits `pilot_verdict` and `decided_at`.
     * That omission is the whole contract of this function, so it is not a
     * detail to tidy up later: adding either column to it makes every re-scan
     * overwrite what a pilot told us.
     */
    export async function upsertScanned(activities: ScannedActivity[]): Promise<Either<void>> {
        if (activities.length === 0) {
            return success(undefined)
        }
        return withPooledClient(async (database: Client) => {
            const errors: string[] = []
            for (const activity of activities) {
                try {
                    await database.query(`
                        insert into activities (strava_activity_id, pilot_id, type, name, start_date,
                                                distance_meters, elapsed_sec, moving_sec,
                                                total_elevation_gain, start_lat, start_lng, end_lat,
                                                end_lng, polyline, verdict, score, reasons,
                                                takeoff_id, landing_id, scanned_at)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                                $15::activity_verdict, $16, $17, $18, $19, now())
                        on conflict (strava_activity_id)
                            do update set type                 = excluded.type,
                                          name                 = excluded.name,
                                          start_date           = excluded.start_date,
                                          distance_meters      = excluded.distance_meters,
                                          elapsed_sec          = excluded.elapsed_sec,
                                          moving_sec           = excluded.moving_sec,
                                          total_elevation_gain = excluded.total_elevation_gain,
                                          start_lat            = excluded.start_lat,
                                          start_lng            = excluded.start_lng,
                                          end_lat              = excluded.end_lat,
                                          end_lng              = excluded.end_lng,
                                          polyline             = excluded.polyline,
                                          verdict              = excluded.verdict,
                                          score                = excluded.score,
                                          reasons              = excluded.reasons,
                                          takeoff_id           = excluded.takeoff_id,
                                          landing_id           = excluded.landing_id,
                                          scanned_at           = now()
                    `, [
                        activity.strava_activity_id,
                        activity.pilot_id,
                        activity.type,
                        activity.name,
                        activity.start_date,
                        activity.distance_meters,
                        activity.elapsed_sec,
                        activity.moving_sec ?? null,
                        activity.total_elevation_gain ?? null,
                        activity.start_lat ?? null,
                        activity.start_lng ?? null,
                        activity.end_lat ?? null,
                        activity.end_lng ?? null,
                        activity.polyline ?? null,
                        activity.verdict,
                        activity.score,
                        JSON.stringify(activity.reasons ?? []),
                        activity.takeoff_id ?? null,
                        activity.landing_id ?? null,
                    ])
                } catch (error) {
                    errors.push(`${activity.strava_activity_id}: ${error}`)
                }
            }
            if (errors.length > 0) {
                return failure(`${errors.length} activities failed: ${errors.join('; ')}`)
            }
            return success(undefined)
        });
    }

    export async function getForPilot(
        pilotId: StravaAthleteId,
        verdict?: ActivityVerdict,
        limit: number = 500
    ): Promise<Either<ActivityRow[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = verdict
                    ? await database.query<ActivityRow>(
                        `select ${COLUMNS} from activities
                         where pilot_id = $1::integer and ${EFFECTIVE} = $2::activity_verdict
                         order by start_date desc limit ${limit}`,
                        [pilotId, verdict]
                    )
                    : await database.query<ActivityRow>(
                        `select ${COLUMNS} from activities
                         where pilot_id = $1::integer
                         order by start_date desc limit ${limit}`,
                        [pilotId]
                    )
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Activities.getForPilot failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    export async function get(
        pilotId: StravaAthleteId,
        activityId: StravaActivityId
    ): Promise<Either<ActivityRow>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<ActivityRow>(
                    `select ${COLUMNS} from activities
                     where strava_activity_id = $1 and pilot_id = $2::integer`,
                    [activityId, pilotId]
                )
                if (result.rows.length !== 1) {
                    return failure(`No activity for id=${activityId}`)
                }
                return success(result.rows[0].reify())
            } catch (error) {
                return failure(`Activities.get failed for id=${activityId}: ${error}`)
            }
        });
    }

    /** The three numbers on the segmented control, in one query. */
    export async function countsForPilot(pilotId: StravaAthleteId): Promise<Either<VerdictCounts>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ verdict: ActivityVerdict, n: number }>(
                    `select ${EFFECTIVE} as verdict, count(1)::int as n
                     from activities
                     where pilot_id = $1::integer
                     group by ${EFFECTIVE}`,
                    [pilotId]
                )
                const counts: VerdictCounts = { flight: 0, unsure: 0, not_flight: 0 }
                for (const row of result.rows) {
                    const { verdict, n } = row.reify()
                    if (verdict in counts) {
                        counts[verdict] = n
                    }
                }
                return success(counts)
            } catch (error) {
                return failure(`Activities.countsForPilot failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    /**
     * The pilot's own most-used Strava activity types.
     *
     * This is what turns "we found nothing" from a dead end into a question: a
     * pilot who logs flights as a Hike is shown their 340 Hikes and taps once,
     * rather than being asked to guess at Strava's vocabulary.
     */
    export async function typeCountsForPilot(
        pilotId: StravaAthleteId,
        limit: number = 8
    ): Promise<Either<ActivityTypeCount[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<ActivityTypeCount>(
                    `select type, count(1)::int as activities
                     from activities
                     where pilot_id = $1::integer
                     group by type
                     order by activities desc
                     limit ${limit}`,
                    [pilotId]
                )
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Activities.typeCountsForPilot failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    /** Ids we have already scanned, so a re-scan can stop early. */
    export async function knownIdsForPilot(
        pilotId: StravaAthleteId
    ): Promise<Either<StravaActivityId[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `select strava_activity_id from activities where pilot_id = $1::integer`,
                    [pilotId]
                )
                return success(result.rows.map(row => row.reify().strava_activity_id))
            } catch (error) {
                return failure(`Activities.knownIdsForPilot failed: ${error}`)
            }
        });
    }
}
