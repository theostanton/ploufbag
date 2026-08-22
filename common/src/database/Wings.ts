import { Either, failure, success, StravaAthleteId, Wing, WingId } from '../model';
import { withPooledClient, Client } from '../database';

/**
 * Reading a pilot's gliders.
 *
 * Deliberately read-only for now. Creating, renaming, merging and retiring a
 * wing all belong with the screen that does them -- the shapes those actions
 * want are decided by the UI, not guessed at ahead of it.
 */
export namespace Wings {

    /**
     * `sort` first so a pilot can order their own list, then most recently flown,
     * then name -- the last two so that a pilot who has never touched the order
     * still gets something stable and sensible rather than insertion order.
     *
     * Retired wings are included. They are still the correct attribution for
     * every flight already flown on them, so a caller that wants only current
     * gliders filters, rather than this hiding history.
     */
    const SELECT = `
        select wing_id,
               pilot_id,
               name,
               manufacturer,
               model,
               colour,
               flown_from,
               flown_until,
               retired,
               sort
        from wings
    `

    export async function getForPilot(pilotId: StravaAthleteId): Promise<Either<Wing[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<Wing>(
                    `${SELECT} where pilot_id = $1::integer
                     order by sort, flown_from desc nulls last, lower(name)`,
                    [pilotId]
                )
                // An empty list is a real answer -- a pilot who has connected but
                // not set up a wing yet -- so this is a success, not a failure.
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Wings.getForPilot failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    export async function get(wingId: WingId): Promise<Either<Wing>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<Wing>(`${SELECT} where wing_id = $1::uuid`, [wingId])
                if (result.rows.length !== 1) {
                    return failure(`No wing for wingId=${wingId}`)
                }
                return success(result.rows[0].reify())
            } catch (error) {
                return failure(`Wings.get failed for wingId=${wingId}: ${error}`)
            }
        });
    }
}
