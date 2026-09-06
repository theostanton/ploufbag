import { withPooledClient, Client } from '../database';
import { Either, failure, success, FlightRow, StravaActivityId, StravaAthleteId, DescriptionPreference } from '../model';
import { ALL_DESCRIPTION_DOMAINS } from '../descriptionFooter';

export namespace Flights {
    export async function get(flightId: StravaActivityId): Promise<Either<FlightRow>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightRow>(`
                select *
                from flights
                where strava_activity_id = $1`, [flightId])
            if (result.rows.length === 1) {
                return success(result.rows[0].reify())
            } else {
                return failure(`No results for flightId=${flightId}`)
            }
        });
    }

    export async function getAll(pilotId: StravaAthleteId): Promise<Either<FlightRow[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightRow>(`
                select *
                from flights
                where pilot_id = $1`, [pilotId])
            if (result.rows) {
                return success(result.rows.map(r => r.reify()))
            } else {
                return failure(`Failed to getAll for pilotId=${pilotId}`)
            }
        });
    }

    export async function updateDescription(flightId: StravaActivityId, description: string): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                await database.query(`
                    update flights
                    set description = $1
                    where strava_activity_id = $2
                `, [description, flightId])
                return success(undefined)
            } catch (error) {
                return failure(`Failed to updateDescription flightId=${flightId} description=${description} error=${error}`)
            }
        });
    }

    export async function updateDescriptionWithPreferences(
        flightId: StravaActivityId, 
        description: string, 
        preferencesSnapshot: DescriptionPreference
    ): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                await database.query(`
                    update flights
                    set description = $1, description_preferences_snapshot = $2
                    where strava_activity_id = $3
                `, [description, JSON.stringify(preferencesSnapshot), flightId])
                return success(undefined)
            } catch (error) {
                return failure(`Failed to updateDescriptionWithPreferences flightId=${flightId} error=${error}`)
            }
        });
    }

    export async function upsert(flights: FlightRow[]): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                const errors: string[] = []
                for (const flight of flights) {
                    console.log(`Inserting flight strava_activity_id=${flight.strava_activity_id}`)
                    try {
                        // wing_id alongside wing, and it has to be both.
                        //
                        // This wrote the text and dropped the link. Promotion
                        // has always computed `wing_id` and put it on the row it
                        // passes here, and every one of them was discarded on
                        // the way to the database -- so every flight imported
                        // since wings became a table has a name on it and points
                        // at nothing. The site still reads the text, which is
                        // why nobody noticed; what was silently empty is the
                        // flight count beside each wing on the management screen
                        // and the wing's own colour on the map, both of which
                        // are joins through this column.
                        await database.query(`
                                    insert into flights(pilot_id,
                                                        strava_activity_id,
                                                        wing,
                                                        wing_id,
                                                        duration_sec,
                                                        distance_meters,
                                                        start_date,
                                                        description,
                                                        polyline,
                                                        landing_id,
                                                        takeoff_id)
                                    values ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11)
                                    on conflict(strava_activity_id)
                                        do update set wing=$12,
                                                      wing_id=$13::uuid,
                                                      duration_sec=$14,
                                                      distance_meters=$15,
                                                      start_date=$16,
                                                      description=$17,
                                                      polyline=$18,
                                                      landing_id=$19,
                                                      takeoff_id=$20;
                            `,
                            [
                                flight.pilot_id,
                                flight.strava_activity_id,
                                flight.wing,
                                flight.wing_id ?? null,
                                flight.duration_sec,
                                flight.distance_meters,
                                flight.start_date,
                                flight.description,
                                flight.polyline ?? null,
                                flight.landing_id ?? null,
                                flight.takeoff_id ?? null,

                                flight.wing,
                                flight.wing_id ?? null,
                                flight.duration_sec,
                                flight.distance_meters,
                                flight.start_date,
                                flight.description,
                                flight.polyline ?? null,
                                flight.landing_id ?? null,
                                flight.takeoff_id ?? null,
                            ])
                    } catch (error) {
                        console.log(`Failed:${error}`)
                        errors.push(error!!.toString())
                    }
                }
                if (errors.length > 0) {
                    return failure(`${errors.length} failed: ${errors.join('\n')}`)
                }
                return success(undefined)
            } catch (error) {
                return failure(error!!.toString())
            }
        });
    }

    /**
     * Deletes a flight.
     *
     * What "this was not a flight after all" does to the flights table. The
     * activity itself is untouched -- it stays in `activities` carrying the
     * pilot's verdict, so a later scan never asks about it again.
     *
     * Scoped by pilot id as well as activity id, because the id comes from a
     * browser and a query keyed on it alone would delete anyone's flight.
     */
    export async function remove(
        pilotId: StravaAthleteId,
        flightId: StravaActivityId
    ): Promise<Either<boolean>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `delete from flights
                     where strava_activity_id = $1 and pilot_id = $2::integer
                     returning strava_activity_id`,
                    [flightId, pilotId]
                )
                return success(result.rows.length > 0)
            } catch (error) {
                return failure(`Flights.remove failed for flightId=${flightId}: ${error}`)
            }
        });
    }

    /** Whether this pilot already has a flight for this Strava activity. */
    export async function exists(
        pilotId: StravaAthleteId,
        flightId: StravaActivityId
    ): Promise<Either<boolean>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ n: number }>(
                    `select count(1)::int as n from flights
                     where strava_activity_id = $1 and pilot_id = $2::integer`,
                    [flightId, pilotId]
                )
                return success(result.rows[0].reify().n > 0)
            } catch (error) {
                return failure(`Flights.exists failed for flightId=${flightId}: ${error}`)
            }
        });
    }

    /**
     * Sets, or clears, the wing on some of a pilot's flights.
     *
     * `flights.wing` is kept in step with `wings.name`, as everywhere else --
     * that text column is what gets published to Strava and what the per-wing
     * pages route on.
     *
     * Clearing and setting are two statements rather than one clever one. A
     * single query that handles both needs a join against a subquery that
     * synthesises a null row, and SQL nobody can read at a glance is a poor
     * trade for saving four lines.
     */
    export async function setWing(
        pilotId: StravaAthleteId,
        flightIds: StravaActivityId[],
        wingId: string | null
    ): Promise<Either<number>> {
        if (flightIds.length === 0) {
            return success(0)
        }
        return withPooledClient(async (database: Client) => {
            try {
                if (wingId === null) {
                    const cleared = await database.query<{ strava_activity_id: StravaActivityId }>(
                        `update flights
                         set wing_id = null, wing = null
                         where pilot_id = $1::integer and strava_activity_id = any ($2::text[])
                         returning strava_activity_id`,
                        [pilotId, flightIds]
                    )
                    return success(cleared.rows.length)
                }

                // The wing has to be this pilot's. Joining on pilot_id is what
                // stops a crafted wing id attaching somebody else's glider.
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `update flights f
                     set wing_id = w.wing_id, wing = w.name
                     from wings w
                     where w.wing_id = $3::uuid
                       and w.pilot_id = $1::integer
                       and f.pilot_id = $1::integer
                       and f.strava_activity_id = any ($2::text[])
                     returning f.strava_activity_id`,
                    [pilotId, flightIds, wingId]
                )
                return success(result.rows.length)
            } catch (error) {
                return failure(`Flights.setWing failed: ${error}`)
            }
        });
    }

    /**
     * How many of a pilot's flights have no wing on them.
     *
     * An unattributed flight is a legal, permanent state -- but it is also the
     * one thing worth quietly nudging about, because it is a question only the
     * pilot can answer and it takes one tap.
     */
    /**
     * Flights carrying none of our stats, oldest first.
     *
     * Publishing is tied to promotion: the description is written once, in the
     * same loop that creates the flight, and nothing revisits it. So a flight
     * imported while the writer was broken stays bare for ever -- there is no
     * state that says "this one still needs saying", only the absence of a
     * footer on Strava, which is what this asks about.
     *
     * That is not hypothetical. Twenty-six flights were imported by a sync whose
     * description writer silently published nothing, and by the time it was
     * fixed they were already promoted, so the pass that would have described
     * them had no work left to find.
     *
     * Matched on the stored description rather than by asking Strava, because
     * the row is what we wrote and a request each would cost the rate limit the
     * republishing itself needs. Every domain we have ever published under
     * counts: an activity carrying a legacy footer has been described, and
     * rewriting it is the update path's job, not this one's.
     *
     * Newest first. Either order converges, and the flights a pilot is waiting
     * on are the ones they flew this week -- a backfill that starts in 2019 and
     * works forwards spends its first several runs on activities nobody is
     * looking at while the ones that prompted the whole exercise stay bare.
     */
    export async function getUndescribed(
        pilotId: StravaAthleteId,
        limit: number = 40
    ): Promise<Either<StravaActivityId[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                    `select strava_activity_id
                     from flights
                     where pilot_id = $1::integer
                       and (description is null or description not like all ($2))
                     order by start_date desc
                     limit ${limit}`,
                    [pilotId, ALL_DESCRIPTION_DOMAINS.map(domain => `%🌐 ${domain}%`)]
                )
                return success(result.rows.map(row => row.reify().strava_activity_id))
            } catch (error) {
                return failure(`Flights.getUndescribed failed: ${error}`)
            }
        });
    }

    /**
     * How many flights carry none of our stats. The whole number, not a page of
     * them.
     *
     * `getUndescribed(pilot, 40).length` was standing in for this and cannot
     * exceed the limit it was given, so a backlog of four hundred and a backlog
     * of forty both reported forty. That is not a cosmetic difference: it is the
     * number the caller loops on, and with it pinned at the batch size there is
     * no way to tell a pass that is working through the list from one that is
     * failing to and re-reading the same page every round.
     */
    export async function countUndescribed(pilotId: StravaAthleteId): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ count: number }>(
                    `select count(*)::integer as count
                     from flights
                     where pilot_id = $1::integer
                       and (description is null or description not like all ($2))`,
                    [pilotId, ALL_DESCRIPTION_DOMAINS.map(domain => `%🌐 ${domain}%`)]
                )
                return success(result.rows[0].reify().count)
            } catch (error) {
                return failure(`Flights.countUndescribed failed: ${error}`)
            }
        });
    }

    /**
     * A flight whose description names a glider we never attributed it to.
     *
     * The two callers below share this predicate rather than each writing their
     * own, because one of them is a work list and the other is the `remaining`
     * the sync workflow loops on: a page and a count that disagree about what
     * counts as work is precisely how a pass reports a backlog it is not
     * actually working through.
     *
     * `wing is null`, not `wing_id is null`. A flight carrying free text from
     * the pre-wings importer has a name on it and shows that name on the site;
     * it is missing a *row*, which is what backfill_wings.sql exists to give it.
     * The flights this is about have nothing at all, and it is the site's
     * "Unknown wing" that says so.
     *
     * The regex is deliberately a little wider than extractWingName: a 🪂 line
     * with any non-space character on it. It has to be wide enough that nothing
     * this returns gets declined by the code -- a row the query keeps offering
     * and the pass keeps skipping never leaves the count, and `remaining` then
     * reports a backlog that cannot go down. normaliseWingName truncates rather
     * than rejects for the same reason.
     */
    const NAMES_A_WING = `coalesce(description, '') ~ '(^|\\n)🪂 [^\\n]*[^ \\n]'`

    /**
     * Flights that could be attributed from what the pilot already wrote,
     * newest first.
     *
     * Promotion resolves the wing once, when it creates the flight, and nothing
     * revisits it -- so every flight imported before wings could be created from
     * a description is unattributed for ever, however plainly its own text says
     * "🪂 Susi". Seventeen of them accumulated on one account, which is the
     * seventeen most recent flights that account has.
     *
     * Newest first for the same reason the republish pass is: the flights a
     * pilot is looking at are the ones they flew this week, and a repair that
     * starts in 2019 spends its first rounds on activities nobody has open.
     */
    export async function getUnattributedNamingAWing(
        pilotId: StravaAthleteId,
        limit: number = 40
    ): Promise<Either<Array<{ strava_activity_id: StravaActivityId; description: string }>>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{
                    strava_activity_id: StravaActivityId
                    description: string
                }>(
                    `select strava_activity_id, coalesce(description, '') as description
                     from flights
                     where pilot_id = $1::integer
                       and wing is null
                       and ${NAMES_A_WING}
                     order by start_date desc
                     limit ${limit}`,
                    [pilotId]
                )
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Flights.getUnattributedNamingAWing failed: ${error}`)
            }
        });
    }

    /** How many are left, whole -- not a page of them. See countUndescribed. */
    export async function countUnattributedNamingAWing(
        pilotId: StravaAthleteId
    ): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ n: number }>(
                    `select count(1)::int as n
                     from flights
                     where pilot_id = $1::integer
                       and wing is null
                       and ${NAMES_A_WING}`,
                    [pilotId]
                )
                return success(result.rows[0].reify().n)
            } catch (error) {
                return failure(`Flights.countUnattributedNamingAWing failed: ${error}`)
            }
        });
    }

    export async function countUnattributed(pilotId: StravaAthleteId): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ n: number }>(
                    `select count(1)::int as n
                     from flights
                     where pilot_id = $1::integer and wing_id is null`,
                    [pilotId]
                )
                return success(result.rows[0].reify().n)
            } catch (error) {
                return failure(`Flights.countUnattributed failed: ${error}`)
            }
        });
    }
}