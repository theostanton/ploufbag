import {StravaActivityId, StravaAthleteId} from "@/stravaApi/model";
import {LatLng, Polyline, SiteType} from '@ploufbag/common';

export {LatLng, Polyline, SiteType};

export type PilotRow = {
    pilot_id: StravaAthleteId
    first_name: string
    profile_image_url: string | null
}

export type PilotRowFull = PilotRow & {
    strava_access_token: string
    strava_refresh_token: string
    strava_expires_at: Date
}

export type     FlightRow = {
    pilot_id: StravaAthleteId
    strava_activity_id: StravaActivityId
    wing: string
    duration_sec: number
    distance_meters: number
    start_date: Date
    description: string
    polyline: Polyline | undefined
    landing_id: string | undefined
    takeoff_id: string | undefined
}


export type Site = {
    ffvl_sid: string,
    slug: string,
    name: string,
    lat: number,
    lng: number,
    alt: number,
    polygon: Polyline | null
    type: SiteType | null
    nearest_balise_id: string | null
}


export type DescriptionPreference = {
    pilot_id: StravaAthleteId
    include_sites: boolean
    include_wind: boolean
    include_wing_aggregate: boolean
    include_year_aggregate: boolean
    include_all_time_aggregate: boolean
}

export type Windsock = {
    balise_id: string,
    name: string,
    lat: number,
    lng: number,
    alt: number,
}