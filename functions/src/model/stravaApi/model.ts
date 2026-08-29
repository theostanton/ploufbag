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

/**
 * What Strava's activity *list* endpoint returns, corrected.
 *
 * This type used to declare a `description`, which the list endpoint has never
 * returned -- descriptions come only from the detail endpoint, one activity at a
 * time. That mistake is why the importer fetched every candidate individually:
 * it needed the 🪂 line, and the only way to get it was the expensive path.
 *
 * The fields below are all on the summary, which is what lets a whole history be
 * classified in a couple of requests.
 */
export type StravaActivitySummary = {
    id: StravaActivityId
    name: string
    distance: number
    type: StravaActivityType
    moving_time: number
    elapsed_time: number
    /** Cumulative climb in metres. Separates flying from walking uphill. */
    total_elevation_gain: number
    start_date: Date
    /** Empty arrays, not null, when Strava has no GPS for the activity. */
    start_latlng: [number, number] | []
    end_latlng: [number, number] | []
    map: {
        /**
         * The list endpoint's coarse track. Named differently from the detail
         * endpoint's `polyline`, and returned as an empty string when there is
         * no GPS.
         */
        summary_polyline: string
    }
}

/**
 * What the *detail* endpoint returns: the summary plus the description and the
 * full-resolution track.
 */
export type StravaActivity = Omit<StravaActivitySummary, 'map'> & {
    description: string
    map: {
        polyline: string
        summary_polyline?: string
    }
}

/**
 * The streams endpoint, asked for keyed by type.
 *
 * Every stream is optional: Strava returns only what it has, so an activity
 * recorded without GPS comes back with `time` and nothing to go with it.
 */
export type StravaStreams = {
    time?: { data: number[] }
    latlng?: { data: ([number, number] | [])[] }
    altitude?: { data: number[] }
}

/**
 * Check if a Strava activity type should be imported as a paragliding flight
 * Currently supports: Kitesurf and Workout (paragliding activities are logged as Workout)
 */
export function isRelevantActivityType(activityType: string): boolean {
    return activityType === 'Kitesurf' || activityType === 'Workout';
}