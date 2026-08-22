import {failure, Either, success} from "@model/Either";
import {StravaAthleteId} from "@ploufbag/common";
import {withPooledClient} from "@database/client";

export type PilotWingStats = {
    wingStats: WingStatItem[]
}

export type WingStatItem = {
    wing: string
    flights: number
}

export async function getPilotWingStats(pilotId: StravaAthleteId): Promise<Either<PilotWingStats>> {
    return withPooledClient(async (database) => {
        // Flights with no wing are excluded rather than grouped under a null.
        //
        // `flights.wing` became nullable so that a flight we cannot attribute
        // survives as an unattributed flight. A null group would reach the
        // dashboard and the pilot page, both of which call
        // `item.wing.toLowerCase()` to build a link to the per-wing page — and
        // there is no per-wing page for a wing that does not exist.
        //
        // This still groups by the wing *text*, so two spellings of one glider
        // are still two rows here even though the backfill has merged them into
        // one wing. Moving the tally onto wings proper belongs with the screen
        // that lets a pilot edit them, since the per-wing route resolves by text
        // and has to move at the same time.
        const result = await database.query<WingStatItem>(`
            select trim(wing) as wing, count(1) as flights
            from flights
            where pilot_id = $1::integer
              and wing is not null
              and trim(wing) <> ''
            group by trim(wing)
            order by flights desc
        `, [pilotId])

        if (!result.rows) {
            return failure(`No PilotWingStats for pilotId=${pilotId}`)
        }

        return success({
            wingStats: result.rows.map((row) => row.reify()),
        })
    });
}