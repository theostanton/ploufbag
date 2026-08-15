import { 
    DescriptionPreference, 
    FlightRow, 
    SiteType 
} from './types';
import { formatSiteName, formatAggregationResult } from './utils';
import { descriptionFooter, SAMPLE_SLUG } from './descriptionFooter';

// Client-side only version of DescriptionFormatter for previews
export class DescriptionFormatterClient {
    private wingPrefix: string;
    private yearPrefix: string;
    private allTimePrefix: string;
    private maxLength: number;

    constructor(
        private flightRow: FlightRow,
        private preference: DescriptionPreference
    ) {
        this.allTimePrefix = 'All Time'
        this.wingPrefix = `🪂 ${this.flightRow.wing}`
        this.yearPrefix = this.flightRow.start_date.getFullYear().toString()
        this.maxLength = 2 + Math.max(this.wingPrefix.length, this.yearPrefix.length, this.allTimePrefix.length)
    }

    // Client-side preview generation without database dependencies
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
        const wingPrefix = this.wingPrefix;
        const yearPrefix = this.yearPrefix;
        const allTimePrefix = this.allTimePrefix;
        const maxLength = this.maxLength;

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

        return [...lines, descriptionFooter(this.flightRow.slug ?? SAMPLE_SLUG)].join('\n');
    }
}