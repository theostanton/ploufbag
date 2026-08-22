import { withPooledClient, Client } from '../database';
import { Either, failure, success, FlightRow, StravaActivityId, StravaAthleteId, DescriptionPreference } from '../model';

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
                        await database.query(`
                                    insert into flights(pilot_id,
                                                        strava_activity_id,
                                                        wing,
                                                        duration_sec,
                                                        distance_meters,
                                                        start_date,
                                                        description,
                                                        polyline,
                                                        landing_id,
                                                        takeoff_id)
                                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                    on conflict(strava_activity_id)
                                        do update set wing=$11,
                                                      duration_sec=$12,
                                                      distance_meters=$13,
                                                      start_date=$14,
                                                      description=$15,
                                                      polyline=$16,
                                                      landing_id=$17,
                                                      takeoff_id=$18;
                            `,
                            [
                                flight.pilot_id,
                                flight.strava_activity_id,
                                flight.wing,
                                flight.duration_sec,
                                flight.distance_meters,
                                flight.start_date,
                                flight.description,
                                flight.polyline ?? null,
                                flight.landing_id ?? null,
                                flight.takeoff_id ?? null,

                                flight.wing,
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