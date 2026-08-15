import { 
    DescriptionPreference, 
    FlightRow, 
    SiteType, 
    AggregationResult, 
    StravaAthleteId
} from './types';
import { formatSiteName, formatAggregationResult } from './utils';
import { Client } from './database';
import { isSuccess, WindReport, WindDirection } from './model';
import { DESCRIPTION_FOOTER } from './descriptionFooter';

export interface PreferencesProvider {
    get(pilotId: StravaAthleteId): Promise<{ success: true; value: DescriptionPreference } | { success: false; error: string }>;
}

// Default preferences if none found
const DEFAULT_PREFERENCES: Omit<DescriptionPreference, 'pilot_id'> = {
    include_all_time_aggregate: true,
    include_sites: true,
    include_wind: true,
    include_wing_aggregate: true,
    include_year_aggregate: true
};

async function getPreferenceForPilotOrDefaults(
    pilotId: StravaAthleteId, 
    preferencesProvider: PreferencesProvider
): Promise<DescriptionPreference> {
    const result = await preferencesProvider.get(pilotId);
    if (result.success) {
        return result.value;
    } else {
        return {
            pilot_id: pilotId,
            ...DEFAULT_PREFERENCES
        };
    }
}

export class DescriptionFormatter {
    private lines: string[] = []
    private readonly maxLength: number;
    private wingPrefix: string;
    private yearPrefix: string;
    private allTimePrefix: string;

    static async create(
        flightRow: FlightRow, 
        preferencesProvider: PreferencesProvider
    ): Promise<DescriptionFormatter> {
        const preference = await getPreferenceForPilotOrDefaults(flightRow.pilot_id, preferencesProvider);
        return new DescriptionFormatter(flightRow, preference);
    }

    constructor(
        private flightRow: FlightRow,
        private preference: DescriptionPreference
    ) {
        this.allTimePrefix = 'All Time'
        this.wingPrefix = `🪂 ${this.flightRow.wing}`
        this.yearPrefix = this.flightRow.start_date.getFullYear().toString()
        this.maxLength = 2 + Math.max(this.wingPrefix.length, this.yearPrefix.length, this.allTimePrefix.length)
    }

    async appendWingAggregation(client: Client) {
        if (!this.preference.include_wing_aggregate) {
            return
        }
        const result = await client.query<AggregationResult>(`
            select count(1)::int               as count,
                   sum(duration_sec)::float    as total_duration_sec,
                   sum(distance_meters)::float as total_distance_meters
            from flights
            where pilot_id = $1
              and wing = $2
              and start_date <= $3
        `, [this.flightRow.pilot_id, this.flightRow.wing, this.flightRow.start_date])

        const values = result.rows[0].reify()

        this.lines.push(`${this.wingPrefix.padEnd(this.maxLength, " ")}${formatAggregationResult(values)}`)
    }

    async generateSiteLine(
        siteType: SiteType, 
        siteName: string, 
        baliseId: string | undefined,
        getWindReport?: (baliseId: string, date: Date) => Promise<WindReport | null>
    ): Promise<string> {
        const prefix = siteType == SiteType.TakeOff ? "↗️" : "↘️"
        const date = this.flightRow.start_date
        const formattedSiteName = formatSiteName(siteName)

        console.log(`DescriptionFormatter::generateSiteLine baliseId=${baliseId}: include_wind=${this.preference.include_wind}`)

        if (baliseId && this.preference.include_wind && getWindReport) {
            const windReport = await getWindReport(baliseId, date);

            if (windReport) {
                return `${prefix} ${formattedSiteName} ${windReport.windKmh}kmh/${windReport.gustKmh}kmh ${WindDirection[windReport.direction]}`
            }
        }

        return `${prefix} ${formattedSiteName}`
    }

    async appendSites(client: Client, getWindReport?: (baliseId: string, date: Date) => Promise<WindReport | null>) {
        if (!this.preference.include_sites) {
            return
        }

        type Row = {
            landing_name: string,
            landing_balise_id: string | undefined,
            takeoff_name: string,
            takeoff_balise_id: string | undefined
        }
        const result = await client.query<Row>(`
            select t.name              as takeoff_name,
                   t.nearest_balise_id as takeoff_balise_id,
                   l.name              as landing_name,
                   l.nearest_balise_id as landing_balise_id
            from flights as f
                     inner join sites as t on f.takeoff_id = t.ffvl_sid
                     inner join sites as l on f.landing_id = l.ffvl_sid
            where strava_activity_id = $1
        `, [this.flightRow.strava_activity_id])

        if (result.rows.length === 0) {
            return;
        }

        const row = result.rows[0].reify()

        const takeoffLine = await this.generateSiteLine(SiteType.TakeOff, row.takeoff_name, row.takeoff_balise_id, getWindReport)
        this.lines.push(takeoffLine)

        const landingLine = await this.generateSiteLine(SiteType.Landing, row.landing_name, row.landing_balise_id, getWindReport)
        this.lines.push(landingLine)
    }

    async appendYearAggregation(client: Client) {
        if (!this.preference.include_year_aggregate) {
            return
        }

        const result = await client.query<AggregationResult>(`
            select count(1)::int               as count,
                   sum(duration_sec)::float    as total_duration_sec,
                   sum(distance_meters)::float as total_distance_meters
            from flights
            where pilot_id = $1
              and start_date <= $2
              and date_part('year', start_date) = date_part('year', $2)
        `, [this.flightRow.pilot_id, this.flightRow.start_date])

        const values = result.rows[0].reify()

        this.lines.push(`${this.yearPrefix.padEnd(this.maxLength, " ")}  ${formatAggregationResult(values)}`)
    }

    async appendAllTimeAggregation(client: Client) {
        if (!this.preference.include_all_time_aggregate) {
            return
        }

        const result = await client.query<AggregationResult>(`
            select count(1)::int               as count,
                   sum(duration_sec)::float    as total_duration_sec,
                   sum(distance_meters)::float as total_distance_meters
            from flights
            where pilot_id = $1
              and start_date <= $2
        `, [this.flightRow.pilot_id, this.flightRow.start_date])

        const values = result.rows[0].reify()

        this.lines.push(`${this.allTimePrefix.padEnd(this.maxLength, " ")}  ${formatAggregationResult(values)}`)
    }

    async generate(client: Client, getWindReport?: (baliseId: string, date: Date) => Promise<WindReport | null>): Promise<string | null> {
        if (this.lines.length == 0) {
            await this.appendSites(client, getWindReport)
            await this.appendWingAggregation(client)
            await this.appendYearAggregation(client)
            await this.appendAllTimeAggregation(client)
        }

        if (this.lines.length == 0) {
            return null;
        }

        return [...this.lines, DESCRIPTION_FOOTER].join('\n')
    }

    // Standalone preview generation without database dependencies
    generatePreview(
        sampleData?: {
            takeoff_name?: string;
            landing_name?: string;
            wing_flights?: number;
            wing_duration?: number;
            year_flights?: number;
            year_duration?: number;
            all_time_flights?: number;
            all_time_duration?: number;
        }
    ): string {
        const lines: string[] = [];
        const wingPrefix = `🪂 ${this.flightRow.wing}`;
        const yearPrefix = this.flightRow.start_date.getFullYear().toString();
        const allTimePrefix = 'All Time';
        const maxLength = 2 + Math.max(wingPrefix.length, yearPrefix.length, allTimePrefix.length);

        // Sites
        if (this.preference.include_sites && sampleData?.takeoff_name && sampleData?.landing_name) {
            const formattedTakeoffName = formatSiteName(sampleData.takeoff_name);
            const formattedLandingName = formatSiteName(sampleData.landing_name);
            
            if (this.preference.include_wind) {
                lines.push(`↗️ ${formattedTakeoffName} 12kmh/18kmh NW`);
                lines.push(`↘️ ${formattedLandingName} 8kmh/15kmh N`);
            } else {
                lines.push(`↗️ ${formattedTakeoffName}`);
                lines.push(`↘️ ${formattedLandingName}`);
            }
        }

        // Wing aggregate
        if (this.preference.include_wing_aggregate) {
            const wingFlights = sampleData?.wing_flights || 15;
            const wingDuration = sampleData?.wing_duration || (18 * 3600 + 45 * 60); // 18h 45min
            lines.push(`${wingPrefix.padEnd(maxLength, " ")}  ${formatAggregationResult({ count: wingFlights, total_duration_sec: wingDuration })}`);
        }

        // Year aggregate
        if (this.preference.include_year_aggregate) {
            const yearFlights = sampleData?.year_flights || 42;
            const yearDuration = sampleData?.year_duration || (52 * 3600 + 30 * 60); // 52h 30min
            lines.push(`${yearPrefix.padEnd(maxLength, " ")}  ${formatAggregationResult({ count: yearFlights, total_duration_sec: yearDuration })}`);
        }

        // All time aggregate
        if (this.preference.include_all_time_aggregate) {
            const allTimeFlights = sampleData?.all_time_flights || 87;
            const allTimeDuration = sampleData?.all_time_duration || (124 * 3600 + 15 * 60); // 124h 15min
            lines.push(`${allTimePrefix.padEnd(maxLength, " ")}  ${formatAggregationResult({ count: allTimeFlights, total_duration_sec: allTimeDuration })}`);
        }

        if (lines.length === 0) {
            return 'No preview available with current preferences';
        }

        return [...lines, DESCRIPTION_FOOTER].join('\n');
    }
}