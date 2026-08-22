import { withPooledClient, Client } from '../database';
import { Either, failure, success, PilotRow, PilotRowFull, StravaAthleteId } from '../model';
import axios from 'axios';

export namespace Pilots {
    export async function insert(pilot: PilotRowFull): Promise<void> {
        return withPooledClient(async (database) => {
            await database.query("INSERT into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token, strava_expires_at, profile_image_url) values ($1, $2, $3,$4, $5, $6)",
                [pilot.pilot_id, pilot.first_name, pilot.strava_access_token, pilot.strava_refresh_token, pilot.strava_expires_at, pilot.profile_image_url]);
        });
    }

    export async function get(pilotId: StravaAthleteId): Promise<Either<PilotRow>> {
        return withPooledClient(async (database) => {
            const result = await database.query<PilotRow>("select pilot_id,first_name,profile_image_url from pilots where pilot_id = $1", [pilotId])
            if (result.rows.length === 1) {
                return success(result.rows[0].reify())
            } else {
                return failure(`No pilots for pilotId=${pilotId}`)
            }
        });
    }

    export async function getFull(pilotId: StravaAthleteId): Promise<Either<PilotRowFull>> {
        return withPooledClient(async (database) => {
            const result = await database.query<PilotRowFull>("select pilot_id,first_name,strava_access_token, strava_refresh_token, strava_expires_at, profile_image_url from pilots where pilot_id = $1", [pilotId])
            if (result.rows.length === 1) {
                return success(result.rows[0].reify())
            } else {
                return failure(`No pilots for pilotId=${pilotId}`)
            }
        });
    }

    /**
     * Which Strava activity types this pilot logs flights as.
     *
     * Null means never asked, which is not the same as an empty list: the
     * classifier falls back to its defaults for the first, and the empty state
     * is what turns the second into a question. Replaces the hard-coded pair in
     * isRelevantActivityType, which is why a pilot logging flights as anything
     * else saw an empty account and was never told why.
     */
    export async function getFlightActivityTypes(
        pilotId: StravaAthleteId
    ): Promise<Either<string[] | null>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<{ flight_activity_types: string[] | null }>(
                    `select flight_activity_types from pilots where pilot_id = $1::integer`,
                    [pilotId]
                )
                if (result.rows.length !== 1) {
                    return failure(`No pilot with id ${pilotId}`)
                }
                return success(result.rows[0].reify().flight_activity_types ?? null)
            } catch (error) {
                return failure(`Pilots.getFlightActivityTypes failed: ${error}`)
            }
        });
    }

    export async function setFlightActivityTypes(
        pilotId: StravaAthleteId,
        types: string[]
    ): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                await database.query(
                    `update pilots set flight_activity_types = $2 where pilot_id = $1::integer`,
                    [pilotId, types]
                )
                return success(undefined)
            } catch (error) {
                return failure(`Pilots.setFlightActivityTypes failed: ${error}`)
            }
        });
    }

    export async function getAccessToken(pilotId: StravaAthleteId): Promise<Either<string>> {
        console.log(`Pilots.getAccessToken() pilotId=${pilotId}`);
        return withPooledClient(async (database) => {
            const result = await database.query<PilotRowFull>(
                "select pilot_id,first_name,strava_access_token,strava_refresh_token,strava_expires_at,profile_image_url from pilots where pilot_id = $1",
                [pilotId]
            )

            if (result.rows.length !== 1) {
                return failure(`No pilots for pilotId=${pilotId}`)
            }
            const pilotRowFull = result.rows[0].reify()

            if (pilotRowFull.strava_expires_at > new Date()) {
                return success(result.rows[0].reify().strava_access_token)
            }

            console.log('Refreshing token')
            const params = new URLSearchParams({
                client_id: process.env.CLIENT_ID!!.toString(),
                client_secret: process.env.CLIENT_SECRET!!.toString(),
                grant_type: "refresh_token",
                refresh_token: pilotRowFull.strava_refresh_token,
            }).toString();

            let url = `https://www.strava.com/oauth/token?${params}`;
            const response = await axios.post(url)
            if (response.status != 200) {
                return failure(`Failed to refresh access token: status=${response.status} ${JSON.stringify(response)}`);
            }

            console.log(`Got refresh response =${JSON.stringify(response.data)}`)

            await database.query(`update pilots
                                  set strava_access_token=$1,
                                      strava_refresh_token=$2,
                                      strava_expires_at=$3
                                  where pilot_id = $4;`,
                [
                    response.data.access_token,
                    response.data.refresh_token,
                    new Date(response.data.strava_expires_at * 1000),
                    pilotId
                ])

            return success(response.data.access_token)
        });

    }
}