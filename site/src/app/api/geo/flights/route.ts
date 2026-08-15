import { NextResponse } from 'next/server'
import { Flights } from '@database/flights'
import { simplifyPolyline } from '@utils/simplifyPolyline'
import { getFlightColor } from '@ui/map/colors'
import type { FlightCollection, FlightFeature } from '@ui/map/geo'

/**
 * Every flight as a GeoJSON FeatureCollection of LineStrings.
 *
 * The map draws this once, as a single source, and each route emphasises a
 * subset of it. That is what keeps the world populated behind a flight detail
 * view instead of showing one track floating in an empty map.
 *
 * Three things happen here that used to happen in the browser, four times over:
 *
 *   1. The lat/lng flip. `Polyline` is [lat, lng] everywhere in the database and
 *      the common package; GeoJSON is [lng, lat]. The old map components each
 *      repeated `.map(([lat, lng]) => [lng, lat])` -- six times across four
 *      files -- and any one of them getting it wrong put tracks in the Indian
 *      Ocean.
 *   2. Simplification. See simplifyPolyline; this is a straight reduction, since
 *      /flights already serialised every full polyline into the RSC payload.
 *   3. Colour. Baked into properties so one line layer can paint every track
 *      from ['get', 'color'], replacing a source and layer per flight.
 */
/**
 * Five decimal places is about 1.1 m of latitude — finer than the GPS in a
 * vario and far finer than any zoom level renders. Serialising a full IEEE
 * double per coordinate spends several bytes each on digits nobody can see.
 */
const round5 = (value: number) => Math.round(value * 1e5) / 1e5

export async function GET() {
    const [flights, errorMessage] = await Flights.getAll()

    if (!flights) {
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    const features: FlightFeature[] = []
    for (const flight of flights) {
        const simplified = simplifyPolyline(flight.polyline)
        // A LineString needs two positions. Flights with a missing or degenerate
        // polyline are real -- an activity Strava has no GPS for -- and they
        // still belong in the lists, just not on the map.
        if (simplified.length < 2) continue

        const id = String(flight.strava_activity_id)
        features.push({
            type: 'Feature',
            id,
            geometry: {
                type: 'LineString',
                coordinates: simplified.map(([lat, lng]) => [round5(lng), round5(lat)]),
            },
            properties: {
                id,
                pilotId: flight.pilot_id,
                pilotName: flight.pilot?.first_name ?? null,
                wing: flight.wing ?? 'unknown',
                color: getFlightColor(String(flight.pilot_id), flight.wing || 'unknown'),
                startDate:
                    flight.start_date instanceof Date
                        ? flight.start_date.toISOString()
                        : String(flight.start_date),
                durationSec: flight.duration_sec,
                distanceMeters: flight.distance_meters,
                takeoffId: flight.takeoff?.ffvl_sid ?? null,
                landingId: flight.landing?.ffvl_sid ?? null,
                takeoffName: flight.takeoff?.name ?? null,
                landingName: flight.landing?.name ?? null,
                slug: flight.slug ?? null,
            },
        })
    }

    const collection: FlightCollection = { type: 'FeatureCollection', features }

    return NextResponse.json(collection, {
        headers: {
            // Flights only appear when a Strava webhook fires, so a minute of
            // staleness is invisible, and this is the largest payload the site
            // serves.
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
    })
}
