import { NextResponse } from 'next/server'
import { Sites } from '@database/Sites'
import { SITE_COLORS } from '@ui/map/colors'
import type { SiteCollection, SiteFeature, SiteFeatureProperties } from '@ui/map/geo'

/**
 * Every site as a GeoJSON FeatureCollection of Points.
 *
 * These were DOM markers before -- one `new mapboxgl.Marker()` per site, with
 * hand-built popup HTML. A circle layer over one source scales to any number of
 * sites, styles from the data, and can be hit-tested and hover-highlighted with
 * the same machinery as the tracks.
 */

/**
 * A site's role from how it is actually used, falling back to the declared
 * type. `sites.type` is nullable and is null for every site the FFVL sync has
 * not classified, including the fixture rows.
 */
function roleOf(takeoffCount: number, landingCount: number, declared: string | null) {
    if (takeoffCount > 0 && landingCount > 0) return 'both' as const
    if (takeoffCount > 0) return 'takeoff' as const
    if (landingCount > 0) return 'landing' as const
    if (declared === 'Takeoff') return 'takeoff' as const
    if (declared === 'Landing') return 'landing' as const
    return 'unknown' as const
}

export async function GET() {
    const [sites, errorMessage] = await Sites.getAllForMap()

    if (!sites) {
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    const features: SiteFeature[] = []
    for (const site of sites) {
        // Sites carry no geometry validation anywhere upstream, and a site at
        // (0, 0) drags the camera into the Gulf of Guinea whenever it is in
        // frame. Cheaper to drop it here than to defend every bounds calculation.
        if (typeof site.lat !== 'number' || typeof site.lng !== 'number') continue
        if (site.lat === 0 && site.lng === 0) continue

        const role = roleOf(site.takeoffCount, site.landingCount, site.type)
        const properties: SiteFeatureProperties = {
            id: site.ffvl_sid,
            slug: site.slug,
            name: site.name,
            alt: site.alt,
            type: site.type as SiteFeatureProperties['type'],
            flightCount: site.takeoffCount + site.landingCount,
            color: SITE_COLORS[role],
            // Stored [lat, lng] like every other polyline in the schema, flipped
            // here so nothing downstream has to remember which convention it is
            // holding.
            polygon: Array.isArray(site.polygon)
                ? site.polygon.map(([lat, lng]) => [lng, lat] as [number, number])
                : null,
        }

        features.push({
            type: 'Feature',
            id: site.ffvl_sid,
            geometry: { type: 'Point', coordinates: [site.lng, site.lat] },
            properties,
        })
    }

    const collection: SiteCollection = { type: 'FeatureCollection', features }

    return NextResponse.json(collection, {
        headers: {
            // Sites change only when the FFVL sync task runs.
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
    })
}
