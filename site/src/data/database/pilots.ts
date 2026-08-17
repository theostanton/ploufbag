import {failure, Either, success} from "@model/Either";
import {getDatabase, withPooledClient} from "./client";
import {Pilot} from "@ploufbag/common";

export async function getAll(): Promise<Either<Pilot[]>> {
    return withPooledClient(async (database) => {
        const result = await database.query<Pilot>(`
            select first_name, pilot_id, profile_image_url
            from pilots`)
        if (result.rows) {
            return success(result.rows.map(row => row.reify()))
        } else {
            return failure(`No pilots`)
        }
    });
}

export type PilotWithActivity = Pilot & { flightCount: number, lastFlight: Date | null }

/**
 * Pilots with something to say about them, ordered by who flies most.
 *
 * getAll() returns names and avatars only, which made /pilots a column of bare
 * words: nothing to compare, nothing to rank, no reason to click any particular
 * one. A flight count and a last-flown date are the two facts that turn that
 * list into something you can read.
 *
 * Left join rather than inner: a pilot who has connected but has no imported
 * flights yet still belongs on the list, and seeing themselves there with a
 * zero is how they know the connection worked.
 */
export async function getAllWithActivity(): Promise<Either<PilotWithActivity[]>> {
    return withPooledClient(async (database) => {
        const result = await database.query<{
            first_name: string
            pilot_id: number
            profile_image_url: string | null
            flight_count: string
            last_flight: Date | null
        }>(`
            select p.first_name,
                   p.pilot_id,
                   p.profile_image_url,
                   count(f.strava_activity_id)::text as flight_count,
                   max(f.start_date)                 as last_flight
            from pilots p
                     left join flights f on f.pilot_id = p.pilot_id
            group by p.pilot_id, p.first_name, p.profile_image_url
            order by count(f.strava_activity_id) desc, p.first_name`)
        if (result.rows) {
            return success(result.rows.map(row => {
                const pilot = row.reify()
                return {
                    pilot_id: pilot.pilot_id,
                    first_name: pilot.first_name,
                    profile_image_url: pilot.profile_image_url,
                    flightCount: parseInt(pilot.flight_count),
                    lastFlight: pilot.last_flight,
                }
            }))
        } else {
            return failure(`No pilots`)
        }
    });
}

/**
 * Number of connected pilots, which is what the signup capacity gate compares
 * against. Counted rather than derived from getAll() so the gate does not pull
 * every pilot row on every home page render.
 */
export async function getCount(): Promise<number> {
    return withPooledClient(async (database) => {
        const result = await database.query<{ count: number }>(`
            select count(1)::int as count
            from pilots`)
        return result.rows[0].reify().count
    });
}

export async function get(pilotId: number): Promise<Either<Pilot>> {
    return withPooledClient(async (database) => {
        const result = await database.query<Pilot>(`
            select first_name, pilot_id, profile_image_url
            from pilots
            where pilot_id = $1`, [pilotId])
        if (result.rows.length === 1) {
            return success(result.rows[0].reify())
        } else {
            return failure(`No pilots for pilotId=${pilotId}`)
        }
    });
}