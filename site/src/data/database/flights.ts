import {failure, Either, success} from "@model/Either";
import {withPooledClient, Client} from "./client";
import {FlightWithSites, StravaActivityId, StravaAthleteId} from "@ploufbag/common";

export namespace Flights {

    function generateQuery(where: string = "", limit: number = 9999): string {
        return `select f.pilot_id,
                       f.strava_activity_id,
                       f.wing,
                       f.duration_sec,
                       f.distance_meters,
                       f.start_date,
                       f.description,
                       f.polyline,
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

    export async function getLatest(): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(generateQuery("", 20))
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights`)
            }
        });
    }

    export async function getForPilot(pilotId: StravaAthleteId, limit: number = 1000): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(
                generateQuery("where f.pilot_id = $1::integer", limit),
                [pilotId]
            )
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No flights for pilot_id=${pilotId}`)
            }
        });
    }

    export async function getForPilotAndWing(pilotId: StravaAthleteId, wing: string): Promise<Either<FlightWithSites[]>> {
        return withPooledClient(async (database: Client) => {
            const result = await database.query<FlightWithSites>(
                generateQuery("where f.pilot_id = $1::integer and lower(wing) = $2"),
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