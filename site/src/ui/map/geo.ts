/**
 * The shapes exchanged between /api/geo/* and the map.
 *
 * Everything the map draws comes from these two collections. A route's
 * <MapScene> then names ids within them rather than shipping geometry of its
 * own, which is what lets a flight detail view keep the surrounding flights and
 * sites on screen instead of showing one line in an empty world.
 */

import type { Feature, FeatureCollection, LineString, Point } from 'geojson'

export type FlightFeatureProperties = {
    /** strava_activity_id. Also the feature id, via promoteId. */
    id: string
    pilotId: number
    pilotName: string | null
    wing: string
    /** Baked on the server so the line layer can style from ['get', 'color']. */
    color: string
    startDate: string
    durationSec: number
    distanceMeters: number
    takeoffId: string | null
    landingId: string | null
    takeoffName: string | null
    landingName: string | null
    slug: string | null
}

export type SiteFeatureProperties = {
    /** ffvl_sid. Also the feature id, via promoteId. */
    id: string
    slug: string
    name: string
    alt: number
    type: 'Takeoff' | 'Landing' | null
    /** Takeoffs plus landings, so the map can size a site by how used it is. */
    flightCount: number
    color: string
    /**
     * Site outlines are drawn only for the focused site, so they travel as a
     * ring of [lng, lat] pairs on the point feature rather than as a second
     * collection nearly all of which would go unused.
     */
    polygon: [number, number][] | null
}

export type FlightFeature = Feature<LineString, FlightFeatureProperties>
export type SiteFeature = Feature<Point, SiteFeatureProperties>

export type FlightCollection = FeatureCollection<LineString, FlightFeatureProperties>
export type SiteCollection = FeatureCollection<Point, SiteFeatureProperties>

export const EMPTY_FLIGHTS: FlightCollection = { type: 'FeatureCollection', features: [] }
export const EMPTY_SITES: SiteCollection = { type: 'FeatureCollection', features: [] }
