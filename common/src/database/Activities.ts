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

    const COLUMN_NAMES = [
        'strava_activity_id', 'pilot_id', 'type', 'name', 'start_date',
        'distance_meters', 'elapsed_sec', 'moving_sec', 'total_elevation_gain',
        'start_lat', 'start_lng', 'end_lat', 'end_lng', 'polyline',
        'verdict', 'score', 'reasons', 'takeoff_id', 'landing_id', 'pilot_verdict',
    ]

    /**
     * Columns holding the `activity_verdict` enum.
     *
     * They have to be selected as text. ts-postgres has no decoder for a
     * user-defined type, and rather than failing it hands back null -- so
     * `select verdict from activities` yields null for every row and the whole
     * screen renders empty. The `$n::text::activity_verdict` casts on the write
     * side are the same problem in the other direction, where it instead throws
     * "Unsupported data type: 16445".
     */
    const ENUM_COLUMNS = ['verdict', 'pilot_verdict']

    /** The select list, optionally qualified for a query that joins. */
    const columns = (alias: string = '') =>
        COLUMN_NAMES.map(name => {
            const qualified = alias ? `${alias}.${name}` : name
            return ENUM_COLUMNS.includes(name) ? `${qualified}::text as ${name}` : qualified
        }).join(', ')

    const COLUMNS = columns()

    /**
     * A row as the rest of the codebase expects it.
     *
     * `polyline` and `reasons` are `json` columns, and the driver can hand them
     * back either already parsed or still as a string depending on how the
     * result was produced. Handling both here rather than at each call site is
     * what stops `reasons.slice(0, 2).map(...)` throwing in the browser, which
     * is what a raw string would do.
     */
    function reifyActivity(raw: any): ActivityRow {
        const parse = (value: any, fallback: any) => {
            if (value == null) return fallback
            if (typeof value !== 'string') return value
            try {
                return JSON.parse(value)
            } catch {
                return fallback
            }
        }
        return {
            ...raw,
            polyline: parse(raw.polyline, null),
            reasons: parse(raw.reasons, []),
        }
    }

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
                                $15::text::activity_verdict, $16, $17, $18, $19, now())
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
                                          -- A scan may only overwrite a verdict
                                          -- it is at least as well informed as.
                                          --
                                          -- The history scan works from
                                          -- summaries, which do not carry the
                                          -- description, so letting it write
                                          -- over a verdict that was reached
                                          -- *with* the description throws away
                                          -- the strongest signal there is: an
                                          -- activity recognised by its 🪂 line
                                          -- would be demoted by the next scan,
                                          -- and promoteFlights would then
                                          -- delete the flight and take our text
                                          -- back off Strava. An edit is the one
                                          -- thing that makes a stored verdict
                                          -- worth replacing, and an edit clears
                                          -- description_checked_at below, which
                                          -- puts the row in front of the review
                                          -- pass in the same run.
                                          verdict              = case
                                                                    when activities.description_checked_at is not null
                                                                        then activities.verdict
                                                                    else excluded.verdict end,
                                          score                = case
                                                                    when activities.description_checked_at is not null
                                                                        then activities.score
                                                                    else excluded.score end,
                                          reasons              = case
                                                                    when activities.description_checked_at is not null
                                                                        then activities.reasons
                                                                    else excluded.reasons end,
                                          takeoff_id           = excluded.takeoff_id,
                                          landing_id           = excluded.landing_id,
                                          scanned_at           = now(),
                                          -- An activity that changed on Strava
                                          -- is one we have not really read. The
                                          -- pilot's edit is usually the thing
                                          -- that made it recognisable -- a
                                          -- title, a crop, the 🪂 line -- so
                                          -- forgetting that we checked is what
                                          -- puts it back in front of the review
                                          -- pass. Left alone when nothing moved,
                                          -- or every scan would re-read every
                                          -- rejected activity for ever.
                                          description_checked_at =
                                              case
                                                  when activities.name is distinct from excluded.name
                                                      or activities.elapsed_sec is distinct from excluded.elapsed_sec
                                                      or activities.distance_meters is distinct from excluded.distance_meters
                                                      then null
                                                  else activities.description_checked_at
                                                  end
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
                         where pilot_id = $1::integer and ${EFFECTIVE} = $2::text::activity_verdict
                         order by start_date desc limit ${limit}`,
                        [pilotId, verdict]
                    )
                    : await database.query<ActivityRow>(
                        `select ${COLUMNS} from activities
                         where pilot_id = $1::integer
                         order by start_date desc limit ${limit}`,
                        [pilotId]
                    )
                return success(result.rows.map(row => reifyActivity(row.reify())))
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
                return success(reifyActivity(result.rows[0].reify()))
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
                    `select (${EFFECTIVE})::text as verdict, count(1)::int as n
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

    /**
     * Records what the pilot decided. The only writer of `pilot_verdict`.
     *
     * `null` clears the decision and hands the activity back to the classifier,
     * which is what "undo" means here -- not "set it to what it was", which
     * would freeze a guess into a decision nobody made.
     *
     * Scoped by pilot id as well as activity id: the ids come from a browser.
     */
    export async function setPilotVerdict(
        pilotId: StravaAthleteId,
        activityIds: StravaActivityId[],
        verdict: ActivityVerdict | null
    ): Promise<Either<number>> {
        if (activityIds.length === 0) {
            return success(0)
        }
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `update activities
                     set pilot_verdict = $3::text::activity_verdict,
                         decided_at    = case when $3::text::activity_verdict is null then null else now() end
                     where pilot_id = $1::integer
                       and strava_activity_id = any ($2::text[])
                     returning strava_activity_id`,
                    [pilotId, activityIds, verdict]
                )
                return success(result.rows.length)
            } catch (error) {
                return failure(`Activities.setPilotVerdict failed: ${error}`)
            }
        });
    }

    /**
     * Activities we believe are flights but have no flight row for.
     *
     * The work list for promotion. Bounded by the caller because each one costs
     * Strava requests -- a detail fetch and a description write -- and Strava's
     * limits are per fifteen minutes, so a pilot with two hundred newly found
     * flights is several runs of work, not one.
     */
    export async function getPromotable(
        pilotId: StravaAthleteId,
        limit: number = 40
    ): Promise<Either<ActivityRow[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<ActivityRow>(
                    `select ${columns('a')}
                     from activities a
                              left join flights f
                                        on f.strava_activity_id = a.strava_activity_id
                     where a.pilot_id = $1::integer
                       and coalesce(a.pilot_verdict, a.verdict) = 'flight'::activity_verdict
                       and f.strava_activity_id is null
                     order by a.start_date desc
                     limit ${limit}`,
                    [pilotId]
                )
                return success(result.rows.map(row => reifyActivity(row.reify())))
            } catch (error) {
                return failure(`Activities.getPromotable failed: ${error}`)
            }
        });
    }

    /**
     * Flights whose activity we no longer believe is one.
     *
     * Reachable without anyone pressing a button: a pilot deletes the activity's
     * GPS on Strava, or edits it into something else, and the next scan changes
     * its mind. Left unreconciled, the flight stays on the map for ever with
     * nothing behind it.
     */
    export async function getDemotable(
        pilotId: StravaAthleteId,
        limit: number = 40
    ): Promise<Either<StravaActivityId[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `select f.strava_activity_id
                     from flights f
                              join activities a
                                   on a.strava_activity_id = f.strava_activity_id
                     where f.pilot_id = $1::integer
                       and coalesce(a.pilot_verdict, a.verdict) <> 'flight'::activity_verdict
                     limit ${limit}`,
                    [pilotId]
                )
                return success(result.rows.map(row => row.reify().strava_activity_id))
            } catch (error) {
                return failure(`Activities.getDemotable failed: ${error}`)
            }
        });
    }

    /**
     * Activities we have never read a description for.
     *
     * The gap this closes: a verdict is reached from the summary alone, and the
     * summary does not carry the description. An activity uploaded by a vario
     * and described a minute later -- or cropped, or renamed -- was classified
     * against the version before the edit and never looked at again, because
     * Strava raises no webhook for most edits. This is the list of activities
     * where going and looking could still change our mind.
     *
     * Restricted to `ids` rather than working it out in SQL, because which
     * activities are even candidates is the pilot's own list of flight activity
     * types, and that gate lives in the classifier. Four hundred bike rides
     * should not each cost a Strava request to re-confirm they are bike rides.
     *
     * Rows the pilot has ruled on are left out. They have already been read by
     * the only reader that counts.
     */
    export async function getUnreadCandidates(
        pilotId: StravaAthleteId,
        ids: StravaActivityId[],
        limit: number
    ): Promise<Either<ActivityRow[]>> {
        if (ids.length === 0 || limit <= 0) {
            return success([])
        }
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<ActivityRow>(
                    `select ${COLUMNS}
                     from activities
                     where pilot_id = $1::integer
                       and strava_activity_id = any ($2)
                       and pilot_verdict is null
                       and verdict <> 'flight'::activity_verdict
                       and description_checked_at is null
                     order by start_date desc
                     limit ${limit}`,
                    [pilotId, ids]
                )
                return success(result.rows.map(row => reifyActivity(row.reify())))
            } catch (error) {
                return failure(`Activities.getUnreadCandidates failed: ${error}`)
            }
        });
    }

    /**
     * Records that we have been to Strava for these activities' descriptions.
     *
     * Written whether or not the verdict changed. "We looked and it is still
     * not a flight" is the answer that stops the next scan looking again, and
     * without storing it the review pass would spend its whole budget on the
     * same handful of activities every run.
     */
    export async function markDescriptionChecked(
        ids: StravaActivityId[]
    ): Promise<Either<void>> {
        if (ids.length === 0) {
            return success(undefined)
        }
        return withPooledClient(async (database: Client) => {
            try {
                await database.query(
                    `update activities
                     set description_checked_at = now()
                     where strava_activity_id = any ($1)`,
                    [ids]
                )
                return success(undefined)
            } catch (error) {
                return failure(`Activities.markDescriptionChecked failed: ${error}`)
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
