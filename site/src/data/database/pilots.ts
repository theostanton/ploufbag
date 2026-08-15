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