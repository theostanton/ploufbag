import { StravaActivityId, StravaAthleteId } from '@ploufbag/common';

export { StravaActivityId, StravaAthleteId };

export type StravaAthlete = {
    id: StravaAthleteId
    username: string
    firstname: string
    lastname: string
    city: string
    country: string
    profile: string
    profile_medium: string
}

type StravaActivityType = "AlpineSki" | "KiteSurf" | "Workout" | string

export type StravaActivitySummary = {
    id: StravaActivityId
    name: string
    distance: number
    type: StravaActivityType
    description: string
    moving_time: number
    elapsed_time: number
    start_date: Date
    map: {
        polyline: string
    }
}

export type StravaActivity = StravaActivitySummary & {
    description: string
}

/**
 * Check if a Strava activity type should be imported as a paragliding flight
 * Currently supports: Kitesurf and Workout (paragliding activities are logged as Workout)
 */
export function isRelevantActivityType(activityType: string): boolean {
    return activityType === 'Kitesurf' || activityType === 'Workout';
}