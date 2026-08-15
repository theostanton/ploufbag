import {withPooledClient} from "./client";
import {
    failed,
    success,
    PilotRow,
    PilotRowFull,
    StravaAthleteId,
    Either, failure
} from "@ploufbag/common";
import axios from "axios";

export namespace Pilots {
    export async function insert(pilot: PilotRowFull): Promise<void> {
        return withPooledClient(async (database) => {
            await database.query("INSERT into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token, strava_expires_at, profile_image_url) values ($1, $2, $3,$4, $5, $6)",
                // ?? null: an undefined profile_image_url was reaching postgres
                // as the literal string "undefined" rather than NULL.
                [pilot.pilot_id, pilot.first_name, pilot.strava_access_token, pilot.strava_refresh_token, pilot.strava_expires_at, pilot.profile_image_url ?? null]);
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

    export async function getAccessToken(pilotId: StravaAthleteId): Promise<Either<string>> {
        console.log(`Pilots.getAccessToken() pilotId=${pilotId}`);
        return withPooledClient(async (database) => {
            const result = await database.query<PilotRowFull>(
                "select pilot_id,first_name,strava_access_token,strava_refresh_token,strava_expires_at,profile_image_url from pilots where pilot_id = $1",
                [pilotId]
            )

            if (result.rows.length !== 1) {
                return failed(`No pilots for pilotId=${pilotId}`)
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
                throw failed(`Failed to refresh access token: status=${response.status} ${JSON.stringify(response)}`);
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

    export async function deauthorize(pilotId: StravaAthleteId): Promise<Either<void>> {
        return withPooledClient(async (database) => {
            try {
                // Soft delete - clear tokens but keep pilot record
                await database.query(`
                    UPDATE pilots
                    SET
                        strava_access_token = NULL,
                        strava_refresh_token = NULL,
                        strava_expires_at = NULL
                    WHERE pilot_id = $1
                `, [pilotId]);

                console.log(`Deauthorized pilot ${pilotId}`);
                return success(undefined);
            } catch (error) {
                return failed(`Failed to deauthorize pilot ${pilotId}: ${error}`);
            }
        });
    }
}