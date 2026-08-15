'use server'

import { DescriptionFormatterClient, type DescriptionPreference } from '@ploufbag/common';

export async function generateDescriptionPreview(
    preferences: DescriptionPreference,
    sampleFlightData: {
        wing: string;
        start_date: Date;
        takeoff_name: string;
        landing_name: string;
        pilot_id: number;
        strava_activity_id: string;
        duration_sec: number;
        distance_meters: number;
        description: string;
        polyline: [number, number][];
        landing_id?: string;
        takeoff_id?: string;
    }
): Promise<string> {
    try {
        // Create a minimal FlightRow for the formatter
        const flightRow = {
            pilot_id: sampleFlightData.pilot_id,
            strava_activity_id: sampleFlightData.strava_activity_id,
            wing: sampleFlightData.wing,
            duration_sec: sampleFlightData.duration_sec,
            distance_meters: sampleFlightData.distance_meters,
            start_date: sampleFlightData.start_date,
            description: sampleFlightData.description,
            polyline: sampleFlightData.polyline,
            landing_id: sampleFlightData.landing_id,
            takeoff_id: sampleFlightData.takeoff_id
        };

        const formatter = new DescriptionFormatterClient(flightRow, preferences);
        
        return formatter.generatePreview({
            takeoff_name: sampleFlightData.takeoff_name,
            landing_name: sampleFlightData.landing_name,
            wing_flights: 15,
            wing_duration: 18 * 3600 + 45 * 60, // 18h 45min
            year_flights: 42,
            year_duration: 52 * 3600 + 30 * 60, // 52h 30min
            all_time_flights: 87,
            all_time_duration: 124 * 3600 + 15 * 60 // 124h 15min
        });
    } catch (error) {
        console.error('Error generating description preview:', error);
        return 'Error generating preview';
    }
}