'use client'

import type { MapRef } from 'react-map-gl/mapbox'
import type { FlightCollection, SiteCollection } from './geo'
import type { Scene } from './scene'
import type { Insets } from './store'

/**
 * Where the camera should be, derived from the scene.
 *
 * The camera is not in the URL — a deep link resolves to a view, and the view
 * decides the framing. That means a shared link always shows the subject
 * properly framed on the recipient's screen, whatever its size, rather than
 * replaying a viewport that fitted somebody else's window.
 */

export type Bounds = [west: number, south: number, east: number, north: number]

function extend(bounds: Bounds | null, lng: number, lat: number): Bounds {
    if (!bounds) return [lng, lat, lng, lat]
    return [
        Math.min(bounds[0], lng),
        Math.min(bounds[1], lat),
        Math.max(bounds[2], lng),
        Math.max(bounds[3], lat),
    ]
}

/**
 * Bounds of whatever the scene points at: an explicit box, else the emphasised
 * features, else everything.
 *
 * Returns null when there is nothing to frame at all, in which case the caller
 * leaves the camera where it is rather than jumping to a default.
 */
export function boundsForScene(
    scene: Scene,
    flights: FlightCollection,
    sites: SiteCollection
): Bounds | null {
    if (scene.bounds) return scene.bounds

    const flightIds = scene.emphasis?.flights
    const siteIds = scene.emphasis?.sites
    const hasEmphasis = (flightIds?.length ?? 0) > 0 || (siteIds?.length ?? 0) > 0

    let bounds: Bounds | null = null

    const flightSet = flightIds ? new Set(flightIds) : null
    for (const feature of flights.features) {
        if (hasEmphasis && !flightSet?.has(feature.properties.id)) continue
        for (const [lng, lat] of feature.geometry.coordinates) {
            bounds = extend(bounds, lng, lat)
        }
    }

    const siteSet = siteIds ? new Set(siteIds) : null
    for (const feature of sites.features) {
        if (hasEmphasis && !siteSet?.has(feature.properties.id)) continue
        // With no emphasis, sites alone would stretch the view to every site in
        // the country while the flights are in one valley. Only widen to sites
        // when they are what the scene is actually about.
        if (!hasEmphasis && flights.features.length > 0) continue
        const [lng, lat] = feature.geometry.coordinates
        bounds = extend(bounds, lng, lat)
    }

    return bounds
}

/**
 * fitBounds padding.
 *
 * The insets are how much of the viewport the chrome covers, measured by
 * Chrome.tsx. Adding a margin on top keeps content off the panel edge, and the
 * whole thing is clamped: on a phone the sheet and the top bar together can
 * exceed the viewport height, and Mapbox throws when padding does.
 */
function paddingFor(map: MapRef, insets: Insets) {
    const margin = 40
    const { width, height } = map.getMap().getCanvas().getBoundingClientRect()

    const clamp = (value: number, limit: number) =>
        Math.max(0, Math.min(value + margin, Math.max(0, limit * 0.45)))

    return {
        top: clamp(insets.top, height),
        bottom: clamp(insets.bottom, height),
        left: clamp(insets.left, width),
        right: clamp(insets.right, width),
    }
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Move the camera to frame `bounds`, unless it is already near enough.
 *
 * The near-enough test matters more than it sounds: without it, clicking a track
 * you are already looking at produces a small pointless lurch, and any state
 * change that recomputes the same bounds re-animates the map underneath the
 * user.
 */
export function fitBounds(map: MapRef, bounds: Bounds, insets: Insets, animate = true) {
    const padding = paddingFor(map, insets)
    const [west, south, east, north] = bounds

    // A single point has zero extent; fitBounds on it zooms to the maximum.
    const isPoint = west === east && south === north
    const target = map.getMap().cameraForBounds(
        [
            [west, south],
            [east, north],
        ],
        { padding, maxZoom: isPoint ? 13.5 : 15 }
    )
    if (!target || target.center === undefined || target.zoom === undefined) return

    const current = map.getMap()
    const currentCenter = current.getCenter()
    const targetCenter = 'lng' in target.center
        ? target.center
        : { lng: (target.center as [number, number])[0], lat: (target.center as [number, number])[1] }

    // Compare in screen space rather than in degrees: a tenth of a degree is a
    // long way at zoom 14 and nothing at zoom 6.
    const currentPoint = current.project(currentCenter)
    const targetPoint = current.project(targetCenter as never)
    const pixelDistance = Math.hypot(
        targetPoint.x - currentPoint.x,
        targetPoint.y - currentPoint.y
    )
    const zoomDelta = Math.abs(current.getZoom() - target.zoom)

    if (pixelDistance < 40 && zoomDelta < 0.25) return

    current.easeTo({
        center: targetCenter as never,
        zoom: target.zoom,
        padding,
        duration: animate && !prefersReducedMotion() ? 900 : 0,
        // Keeps the move going through a route transition rather than being
        // cancelled by the browser deprioritising animations mid-navigation.
        essential: true,
    })
}
