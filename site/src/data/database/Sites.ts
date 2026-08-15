import {failure, Either, success} from "@model/Either";
import {getDatabase, withPooledClient} from "./client";
import {Site, StravaAthleteId} from "@ploufbag/common";

export type PilotSitesStats = {
    takeoffs: SitesStatsItem[]
    landings: SitesStatsItem[]
}

export type SitesStatsItem = {
    site: Site
    flights: number
}

export namespace Sites {

    export async function getAll(): Promise<Either<Site[]>> {
        return withPooledClient(async (database) => {
            const result = await database.query<Site>(`
                select *
                from sites
                order by name`)
            if (result.rows) {
                return success(result.rows.map(row => row.reify()))
            } else {
                return failure(`No sites`)
            }
        });
    }

    export async function getForSlug(slug: string): Promise<Either<Site>> {
        return withPooledClient(async (database) => {
            const result = await database.query<Site>(`
                select *
                from sites
                where slug = $1`, [slug])
            if (result.rows.length == 1) {
                return success(result.rows[0].reify())
            } else {
                return failure(`No results for slug=${slug}`)
            }
        });
    }

    export async function getPilotStats(pilotId: StravaAthleteId): Promise<Either<PilotSitesStats>> {
        return withPooledClient(async (database) => {
            const takeoffsResult = await database.query<SitesStatsItem>(`
                with ss as (select s.ffvl_sid as ffvl_sid,
                                   count(1)   as flights
                            from flights as f
                                     left join sites as s on s.ffvl_sid = f.takeoff_id
                            where f.pilot_id = $1::integer
                            group by f.takeoff_id, s.ffvl_sid)

                select ss.flights as flights, to_json(s) as site
                from ss
                         left join sites as s on ss.ffvl_sid = s.ffvl_sid
                order by flights desc;
            `, [pilotId])

            const landingsResult = await database.query<SitesStatsItem>(`
                with ss as (select s.ffvl_sid as ffvl_sid,
                                   count(1)   as flights
                            from flights as f
                                     left join sites as s on s.ffvl_sid = f.landing_id
                            where f.pilot_id = $1::integer
                            group by f.landing_id, s.ffvl_sid)

                select ss.flights as flights,
                       to_json(s) as site
                from ss
                         left join sites as s on ss.ffvl_sid = s.ffvl_sid
                order by flights desc;
            `, [pilotId])

            return success({
                takeoffs: takeoffsResult.rows.map((row) => row.reify()),
                landings: landingsResult.rows.map((row) => row.reify()),
            })
        });
    }

    export async function getAllWithFlightCounts(): Promise<Either<Array<Site & { flightCount: number }>>> {
        return withPooledClient(async (database) => {
            const result = await database.query<Site & { flight_count: string }>(`
                SELECT s.*,
                       COALESCE(takeoff_flights.count, 0) + COALESCE(landing_flights.count, 0) as flight_count
                FROM sites s
                         LEFT JOIN (SELECT takeoff_id, COUNT(*) as count
                                    FROM flights
                                    GROUP BY takeoff_id) takeoff_flights ON s.ffvl_sid = takeoff_flights.takeoff_id
                         LEFT JOIN (SELECT landing_id, COUNT(*) as count
                                    FROM flights
                                    GROUP BY landing_id) landing_flights ON s.ffvl_sid = landing_flights.landing_id
                ORDER BY s.name DESC
            `);
            if (result.rows) {
                return success(result.rows.map(row => {
                    const site = row.reify();
                    return {
                        ...site,
                        flightCount: parseInt(site.flight_count)
                    };
                }));
            } else {
                return failure(`No sites`)
            }
        });
    }

    export type SiteForMap = Site & { takeoffCount: number, landingCount: number }

    /**
     * Every site with its takeoff and landing counts kept apart.
     *
     * getAllWithFlightCounts sums the two, which is all the /sites list needs.
     * The map needs them separately: a site's marker colour is its role, and
     * `sites.type` is nullable and frequently null, so the honest answer comes
     * from how the site is actually used. A site flown from *and* landed at is a
     * different thing on the map from one that is only landed at.
     */
    export async function getAllForMap(): Promise<Either<SiteForMap[]>> {
        return withPooledClient(async (database) => {
            const result = await database.query<Site & { takeoff_count: string, landing_count: string }>(`
                SELECT s.*,
                       COALESCE(takeoff_flights.count, 0) as takeoff_count,
                       COALESCE(landing_flights.count, 0) as landing_count
                FROM sites s
                         LEFT JOIN (SELECT takeoff_id, COUNT(*) as count
                                    FROM flights
                                    GROUP BY takeoff_id) takeoff_flights ON s.ffvl_sid = takeoff_flights.takeoff_id
                         LEFT JOIN (SELECT landing_id, COUNT(*) as count
                                    FROM flights
                                    GROUP BY landing_id) landing_flights ON s.ffvl_sid = landing_flights.landing_id
                ORDER BY s.name
            `);
            if (result.rows) {
                return success(result.rows.map(row => {
                    const site = row.reify();
                    return {
                        ...site,
                        takeoffCount: parseInt(site.takeoff_count),
                        landingCount: parseInt(site.landing_count),
                    };
                }));
            } else {
                return failure(`No sites`)
            }
        });
    }

}