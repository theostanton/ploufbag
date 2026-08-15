import {DESCRIPTION_FOOTER, DescriptionPreference, FlightRow, isSuccess, SiteType, WindDirection} from "@parastats/common";
import {withPooledClient, Client} from "@parastats/common";
import {FFVL} from "@/ffvlApi";
import {DescriptionPreferences} from "@parastats/common";
import {StravaAthleteId} from "@parastats/common";
import {formatSiteName} from "@/utils/formatSiteName";

export type AggregationResult = {
    count: number
    total_duration_sec: number
    total_distance_meters: number
}


async function getPreferenceForPilotOrDefaults(pilotId: StravaAthleteId): Promise<DescriptionPreference> {
    const result = await DescriptionPreferences.get(pilotId)
    if (isSuccess(result)) {
        return result[0]
    } else {
        return {
            pilot_id: pilotId,
            include_all_time_aggregate: true,
            include_sites: true,
            include_wind: true,
            include_wing_aggregate: true,
            include_year_aggregate: true
        }
    }
}

export class DescriptionFormatter {

    private lines: string[] = []
    private readonly maxLength: number;
    private wingPrefix: string;
    private yearPrefix: string;
    private allTimePrefix: string;

    static async create(flightRow: FlightRow) {
        const preference = await getPreferenceForPilotOrDefaults(flightRow.pilot_id)
        return new DescriptionFormatter(flightRow, preference)
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

        this.lines.push(`${this.wingPrefix.padEnd(this.maxLength, " ")}${formatAggregationResult(values)}`)
    }

    async generateSiteLine(siteType: SiteType, siteName: string, baliseId: string | undefined): Promise<string> {

        const prefix = siteType == SiteType.TakeOff ? "↗️" : "↘️"
        const date = siteType == SiteType.TakeOff ? this.flightRow.start_date : new Date(this.flightRow.start_date.getTime() + this.flightRow.duration_sec / 1000)
        const formattedSiteName = formatSiteName(siteName)

        if (baliseId && this.preference.include_wind) {
            const result = await FFVL.getReport(baliseId, date)

            if (isSuccess(result)) {
                const report = result[0]
                return `${prefix} ${formattedSiteName} ${report.windKmh}kmh/${report.gustKmh}kmh ${WindDirection[report.direction]}`
            }
        }

        return `${prefix} ${formattedSiteName}`
    }

    async appendSites(client: Client) {

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

        const row = result.rows[0].reify()

        const takeoffLine = await this.generateSiteLine(SiteType.TakeOff, row.takeoff_name, row.takeoff_balise_id)
        this.lines.push(takeoffLine)

        const landingLine = await this.generateSiteLine(SiteType.Landing, row.landing_name, row.landing_balise_id)
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

        this.lines.push(`${this.yearPrefix.padEnd(this.maxLength, " ")}  ${formatAggregationResult(values)}`)
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

        this.lines.push(`${this.allTimePrefix.padEnd(this.maxLength, " ")}  ${formatAggregationResult(values)}`)
    }

    async generate(): Promise<string | null> {
        return withPooledClient(async (client: Client) => {
            if (this.lines.length == 0) {
                await this.appendSites(client)
                await this.appendWingAggregation(client)
                await this.appendYearAggregation(client)
                await this.appendAllTimeAggregation(client)
            }

            if (this.lines.length == 0) {
                return null;
            }

            return [...this.lines, DESCRIPTION_FOOTER].join('\n')
        });
    }
}


function formatAggregationResult(result: AggregationResult): string {
    return `${result.count} ${result.count == 1 ? "flight" : "flights"} / ${elapsedTime(result.total_duration_sec)}`
}

function elapsedTime(duration_secs: number): string {
    if (duration_secs >= 60 * 60) {
        const hours = Math.floor(duration_secs / (60 * 60))
        const minutes = Math.floor((duration_secs - hours * 60 * 60) / 60)
        return `${hours}h ${minutes}min`
    }
    const minutes = Math.floor(duration_secs / 60)
    return `${minutes}min`
}