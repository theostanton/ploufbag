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
/**
 * The share of an axis the chrome is allowed to claim.
 *
 * Clamping each side independently is not enough. On a phone the top bar and
 * the bottom sheet together asked for more than half the viewport, leaving
 * fitBounds a sliver to work with -- so it zoomed out until the whole of Europe
 * fitted in the gap and the Alps sat behind the sheet. Opposite sides are
 * therefore scaled together, guaranteeing a usable window whatever the chrome
 * is doing.
 */
const MAX_PADDING_SHARE = 0.55

function paddingFor(map: MapRef, insets: Insets) {
    const margin = 32
    const { width, height } = map.getMap().getCanvas().getBoundingClientRect()

    const fitPair = (near: number, far: number, limit: number): [number, number] => {
        let a = Math.max(0, near) + margin
        let b = Math.max(0, far) + margin
        const total = a + b
        const allowed = limit * MAX_PADDING_SHARE
        if (total > allowed && total > 0) {
            const scale = allowed / total
            a *= scale
            b *= scale
        }
        return [Math.round(a), Math.round(b)]
    }

    const [top, bottom] = fitPair(insets.top, insets.bottom, height)
    const [left, right] = fitPair(insets.left, insets.right, width)
    return { top, bottom, left, right }
}

/**
 * How much to tilt, given how far out the camera ended up.
 *
 * Pitch is what makes a ridge run look like a ridge run, but it is actively
 * harmful on a wide view: at continental scale a tilted camera is just a
 * horizon and a lot of sky. Mapbox also computes cameraForBounds as though the
 * camera were flat, so leaving a steep pitch in place while fitting bounds
 * frames the content wrongly on top of looking odd.
 */
function pitchForZoom(zoom: number): number {
    if (zoom <= 9.5) return 0
    if (zoom >= 12.5) return 50
    return ((zoom - 9.5) / 3) * 50
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
    const targetPitch = pitchForZoom(target.zoom)
    const pitchDelta = Math.abs(current.getPitch() - targetPitch)

    if (pixelDistance < 40 && zoomDelta < 0.25 && pitchDelta < 4) return

    current.easeTo({
        center: targetCenter as never,
        zoom: target.zoom,
        pitch: targetPitch,
        padding,
        duration: animate && !prefersReducedMotion() ? 900 : 0,
        // Keeps the move going through a route transition rather than being
        // cancelled by the browser deprioritising animations mid-navigation.
        essential: true,
    })
}
