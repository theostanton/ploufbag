import {withPooledClient} from './client';
import {createFailure, createSuccess, StravaAthleteId} from '@ploufbag/common';
import {Either} from "@model/Either";

export type DescriptionPreference = {
    pilot_id: StravaAthleteId
    include_sites: boolean
    include_wind: boolean
    include_wing_aggregate: boolean
    include_year_aggregate: boolean
    include_all_time_aggregate: boolean
}

export namespace DescriptionPreferences {
    export async function get(pilotId: StravaAthleteId): Promise<Either<DescriptionPreference>> {
        return withPooledClient(async (database) => {
            try {
                const result = await database.query<DescriptionPreference>(
                    "select * from description_preferences where pilot_id = $1",
                    [pilotId]
                );

                if (result.rows.length === 1) {
                    return createSuccess(result.rows[0].reify());
                } else {
                    // Return defaults if no preferences found
                    const defaults: DescriptionPreference = {
                        pilot_id: pilotId,
                        include_sites: true,
                        include_wind: true,
                        include_wing_aggregate: true,
                        include_year_aggregate: true,
                        include_all_time_aggregate: true
                    };
                    return createSuccess(defaults);
                }
            } catch (error) {
                return createFailure(`Failed to get description preferences: ${error}`);
            }
        });
    }

    export async function upsert(preferences: DescriptionPreference): Promise<Either<void>> {
        return withPooledClient(async (database) => {
            try {
                await database.query(`
                    insert into description_preferences(pilot_id,
                                                        include_sites,
                                                        include_wind,
                                                        include_wing_aggregate,
                                                        include_year_aggregate,
                                                        include_all_time_aggregate)
                    values ($1, $2, $3, $4, $5, $6)
                    on conflict(pilot_id)
                        do update set include_sites=$2,
                                      include_wind=$3,
                                      include_wing_aggregate=$4,
                                      include_year_aggregate=$5,
                                      include_all_time_aggregate=$6
                `, [
                    preferences.pilot_id,
                    preferences.include_sites,
                    preferences.include_wind,
                    preferences.include_wing_aggregate,
                    preferences.include_year_aggregate,
                    preferences.include_all_time_aggregate
                ]);

                return createSuccess(undefined);
            } catch (error) {
                return createFailure(`Failed to update description preferences: ${error}`);
            }
        });
    }
}