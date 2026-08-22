// Base ID types
export type StravaAthleteId = number;
export type StravaActivityId = string;
export type PilotId = number;
export type FlightId = number;
export type SiteId = number;


// Core entity types
export type Pilot = {
    first_name: string,
    pilot_id: StravaAthleteId,
    profile_image_url: string | null
}

export enum SiteType {
    Landing,
    TakeOff,
}

export interface Site {
    ffvl_sid: string;
    slug: string;
    name: string;
    lat: number;
    lng: number;
    alt: number;
    polygon: Polyline | undefined;
    nearest_balise_id: string | undefined;
}

export interface Flight {
    pilot_id: StravaAthleteId;
    strava_activity_id: StravaActivityId;
    wing: string | null;
    duration_sec: number;
    distance_meters: number;
    start_date: Date;
    description: string;
    polyline: Polyline;
    takeoff_id: string;
    landing_id: string;
}

export interface FlightWithSites extends Exclude<Flight, 'takeoff_id' | 'landing_id'> {
    takeoff: Site | null;
    landing: Site | null;
    pilot: Pilot | null;
}

// Geometric types
export type LatLng = [lat: number, lng: number]
export type Polyline = LatLng[]

// Database row types
export type FlightRow = {
    pilot_id: StravaAthleteId
    strava_activity_id: StravaActivityId
    /** Nullable since wings became rows -- see the twin in model.ts. */
    wing: string | null
    wing_id?: string | null
    duration_sec: number
    distance_meters: number
    start_date: Date
    description: string
    polyline: Polyline | undefined
    landing_id: string | undefined
    takeoff_id: string | undefined
    /**
     * Short public handle, e.g. `a45nz`, behind ploufbag.com/a45nz.
     *
     * Optional because nothing in application code ever supplies one: the column
     * has a database default that mints it, so rows read back always carry a
     * slug while rows being written never need to. Converters building a
     * FlightRow from a Strava activity therefore do not have to invent one.
     */
    slug?: string
}

export type DescriptionPreference = {
    pilot_id: StravaAthleteId
    include_sites: boolean
    include_wind: boolean
    include_wing_aggregate: boolean
    include_year_aggregate: boolean
    include_all_time_aggregate: boolean
}

export type AggregationResult = {
    count: number
    total_duration_sec: number
    total_distance_meters: number
}

// WindReport is now in model.ts to avoid duplicates
