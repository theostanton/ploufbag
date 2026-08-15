import {failure, Either, success} from "@model/Either";
import {withPooledClient, Client} from "./client";
import {FlightWithSites, StravaActivityId, StravaAthleteId} from "@ploufbag/common";

/**
 * A flight without its track.
 *
 * Every list in the chrome renders from this. The geometry now reaches the
 * browser once, through /api/geo/flights, simplified and cached — so a list
 * that also carried polylines would be shipping the same data twice, in its
 * bulkier form, to render rows that never look at it.
 */
export type FlightSummary = Omit<FlightWithSites, 'polyline'>

export namespace Flights {

    /**
     * @param withPolyline  whether to select the track geometry.
     *
     * Panels that only list flights do not need it, and it is by far the largest
     * column: /flights was serialising every polyline into the RSC payload to
     * render a list that never touched them. The map gets its geometry from
     * /api/geo/flights, once, simplified and cached — so a list query asking for
     * polylines is now pure waste on both the wire and the server.
     */
    function generateQuery(where: string = "", limit: number = 9999, withPolyline: boolean = true): string {
        return `select f.pilot_id,
                       f.strava_activity_id,
                       f.wing,
                       f.duration_sec,
                       f.distance_meters,
                       f.start_date,
                       f.description,
                       ${withPolyline ? 'f.polyline,' : ''}
                       to_json(t) as takeoff,
                       to_json(l) as landing,
                       to_json(p) as pilot
                from flights as f
                         left join sites as t on f.takeoff_id = t.ffvl_sid
                         left join sites as l on f.landing_id = l.ffvl_sid
                         left join pilots as p on f.pilot_id = p.pilot_id
                    ${where}
                order by f.start_date desc
                limit ${limit}`
    }

    /** With polylines: this is the source for /api/geo/flights. */
    export async function getAll(): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(generateQuery())
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights`)
            }
        });
    }

    /** Every flight, for the /flights panel. No geometry — see FlightSummary. */
    export async function getAllSummaries(): Promise<Either<FlightSummary[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightSummary>(generateQuery("", 9999, false))
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights`)
            }
        });
    }

    export async function getLatest(): Promise<Either<FlightSummary[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightSummary>(generateQuery("", 20, false))
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights`)
            }
        });
    }

    export async function getForPilot(pilotId: StravaAthleteId, limit: number = 1000): Promise<Either<FlightSummary[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightSummary>(
                generateQuery("where f.pilot_id = $1::integer", limit, false),
                [pilotId]
            )
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights for pilot_id=${pilotId}`)
            }
        });
    }

    export async function getForPilotAndWing(pilotId: StravaAthleteId, wing: string): Promise<Either<FlightSummary[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightSummary>(
                generateQuery("where f.pilot_id = $1::integer and lower(wing) = $2", 9999, false),
                [pilotId, wing]
            )
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights for pilotId=${pilotId} && wing=${wing}`)
            }
        });
    }

    export async function get(flightId: StravaActivityId): Promise<Either<FlightWithSites>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(generateQuery("where f.strava_activity_id = $1"), [flightId])
            if (result.rows.length === 1) {
                return success(result.rows[0].reify())
            } else {
                return failure(`No flight for flightId=${flightId}`)
            }
        });
    }

    /**
     * Resolves the short public slug published on Strava (ploufbag.com/a45nz)
     * back to the activity id, for the redirect in app/[slug].
     *
     * Deliberately narrower than get(): the caller only needs the id to redirect
     * to, so this skips the site and pilot joins entirely.
     */
    export async function getIdForSlug(slug: string): Promise<Either<StravaActivityId>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<{ strava_activity_id: StravaActivityId }>(
                "select strava_activity_id from flights where slug = $1",
                [slug]
            )
            if (result.rows.length === 1) {
                return success(result.rows[0].reify().strava_activity_id)
            } else {
                return failure(`No flight for slug=${slug}`)
            }
        });
    }

    export async function getPilotFlightCount(pilotId: StravaAthleteId): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<{ count: string }>(
                "SELECT COUNT(*) as count FROM flights WHERE pilot_id = $1::integer",
                [pilotId]
            );
            if (result.rows && result.rows.length > 0) {
                return success(parseInt(result.rows[0].reify().count));
            } else {
                return failure(`Could not get flight count for pilot_id=${pilotId}`);
            }
        });
    }

    export async function getAllForPilotWithPolylines(pilotId: StravaAthleteId): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(
                generateQuery("where f.pilot_id = $1::integer"),
                [pilotId]
            )
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights for pilot_id=${pilotId}`)
            }
        });
    }

    // Still carries polylines because SiteMap draws them. Becomes a summary
    // query when the sites route moves onto the shared map.
    export async function getForSite(siteId: string): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(
                generateQuery("where f.takeoff_id = $1 OR f.landing_id = $1"),
                [parseInt(siteId)]
            )
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights for site_id=${siteId}`)
            }
        });
    }

    // async function rowWithSites(result: Result<Flight>): Promise<Either<FlightWithSites>> {
    //     const flight: Flight = result.rows[0].reify()
    //
    //     const [site, takeoffError] = await Sites.get(flight.takeoff_id)
    //     if (takeoffError) {
    //         console.error(takeoffError)
    //     }
    //     const [landing, landingError] = await Landings.get(flight.landing_id)
    //     if (landingError) {
    //         console.error(landingError)
    //     }
    //     return success({
    //         ...flight,
    //         takeoff,
    //         landing
    //     })
    // }
    //
    // async function rowsWithSites(result: Result<Flight>): Promise<Either<FlightWithSites[]>> {
    //     const flights: Flight[] = result.rows.map(row => row.reify())
    //
    //     const flightWithSites: FlightWithSites[] = []
    //     for await(const flight of flights) {
    //         const [takeoff] = await Takeoffs.get(flight.takeoff_id)
    //         const [landing] = await Landings.get(flight.landing_id)
    //         flightWithSites.push({
    //             ...flight,
    //             takeoff,
    //             landing
    //         })
    //     }
    //     return success(flightWithSites)
    // }
}