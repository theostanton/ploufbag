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