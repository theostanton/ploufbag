import {
    DescriptionFormatter as CommonDescriptionFormatter,
    PreferencesProvider,
    FlightRow,
    StravaAthleteId,
    withPooledClient,
    DescriptionPreferences,
    isSuccess,
    WindReport
} from "@ploufbag/common";
import {FFVL} from "@/ffvlApi";

// Adapter to bridge DescriptionPreferences to common PreferencesProvider interface
class DBPreferencesProvider implements PreferencesProvider {
    async get(pilotId: StravaAthleteId): Promise<{ success: true; value: any } | { success: false; error: string }> {
        const result = await DescriptionPreferences.get(pilotId);

        if (isSuccess(result)) {
            const [preferences] = result;
            return {success: true, value: preferences};
        } else {
            const [, error] = result;
            return {success: false, error};
        }
    }
}

export class DescriptionFormatter {
    static async create(flightRow: FlightRow): Promise<CommonDescriptionFormatter> {
        const preferencesProvider = new DBPreferencesProvider();
        return await CommonDescriptionFormatter.create(flightRow, preferencesProvider);
    }

    static async generateDescription(flightRow: FlightRow): Promise<string | null> {
        const formatter = await DescriptionFormatter.create(flightRow);

        // Create wind report function that uses FFVL.getReport
        const getWindReport = async (baliseId: string, date: Date): Promise<WindReport | null> => {
            const result = await FFVL.getReport(baliseId, date);
            if (isSuccess(result)) {
                const [windReport] = result;
                return {
                    windKmh: windReport.windKmh,
                    gustKmh: windReport.gustKmh,
                    direction: windReport.direction
                };
            }
            return null;
        };

        return withPooledClient(async (client) => {
            return await formatter.generate(client, getWindReport);
        });
    }
}