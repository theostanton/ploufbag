'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Map, { AttributionControl, Layer, MapEvent, MapMouseEvent, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import styles from './MapCanvas.module.css'
import { setHoveredFlight, setHoveredSite, useScene } from './store'
import { useBaseData } from './useBaseData'
import { useMapScene } from './useMapScene'
import {
    FLIGHTS_SOURCE_ID,
    SITES_SOURCE_ID,
    SITE_POLYGON_SOURCE_ID,
    flightCasingLayer,
    flightHitLayer,
    flightLineLayer,
    siteCircleLayer,
    siteLabelLayer,
    sitePolygonFillLayer,
    sitePolygonLineLayer,
} from './layers'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

/**
 * See app/api/dev/mapbox/route.ts. In sandboxes where the browser has no
 * outbound HTTPS but the server does, this sends Mapbox's own requests through
 * the dev server so the map renders. Off unless explicitly enabled.
 */
const DEV_MAP_PROXY = process.env.NEXT_PUBLIC_DEV_MAP_PROXY === '1'

const PROXIED_HOSTS = /(^|\.)((api|[a-d]?\.?tiles)\.)?mapbox\.com$/

function transformRequest(url: string) {
    if (!DEV_MAP_PROXY) return { url }
    try {
        const parsed = new URL(url)
        // Telemetry is deliberately left to fail: it is not needed to render a
        // map, and forwarding usage pings through a dev box is not something to
        // do by accident.
        if (parsed.hostname === 'events.mapbox.com') return { url }
        if (!PROXIED_HOSTS.test(parsed.hostname)) return { url }
        // Absolute, not relative: mapbox-gl fetches tiles from a Web Worker
        // created from a blob URL, where a root-relative path does not resolve
        // against the page origin and every request fails.
        const origin = typeof window === 'undefined' ? '' : window.location.origin
        return { url: `${origin}/api/dev/mapbox?u=${encodeURIComponent(url)}` }
    } catch {
        return { url }
    }
}

/**
 * Opening view: the western Alps, wide enough to hold Annecy, Chamonix and
 * Grenoble at once. Every route that has content to frame overrides this
 * immediately; it is what a visitor sees for the moment before data arrives,
 * and what the marketing routes sit on top of.
 */
const INITIAL_VIEW_STATE = {
    longitude: 6.6,
    latitude: 45.7,
    zoom: 7.4,
    // Flat, like every other wide view -- see pitchForZoom in camera.ts. The
    // camera tilts in as the view closes on a single flight.
    pitch: 0,
    bearing: 0,
}

/**
 * Layers the pointer can reach. Order matters: the site marker wins a tie with
 * a track running underneath it, because it is the smaller target and hitting
 * it is therefore the more deliberate act.
 */
const INTERACTIVE_LAYER_IDS = [siteCircleLayer.id!, flightHitLayer.id!]

/**
 * The single Mapbox instance for the whole application.
 *
 * It is mounted by the root layout, which the App Router does not remount
 * across navigations, so this map is created once per page load and survives
 * every route change. That is the entire premise of the full-bleed design: the
 * four map components this replaces each built their own instance and tore it
 * down on the way out.
 */
export default function MapCanvas() {
    const scene = useScene()
    const baseData = useBaseData()
    const router = useRouter()
    const [isReady, setIsReady] = useState(false)
    const [isHoveringFeature, setIsHoveringFeature] = useState(false)

    useMapScene(baseData, isReady)

    /**
     * The focused site's outline, lifted out of that site's own feature.
     *
     * Polygons ride along on the point features rather than travelling as a
     * second collection, because at most one is ever drawn and shipping every
     * site's outline to render one would be waste.
     */
    const sitePolygon = useMemo(() => {
        const empty = { type: 'FeatureCollection' as const, features: [] }
        if (!scene.focusSitePolygon) return empty
        const site = baseData.sites.features.find(
            (feature) => feature.properties.id === scene.focusSitePolygon
        )
        const ring = site?.properties.polygon
        // A polygon needs three distinct corners; most sites have no outline at
        // all, which is normal rather than an error.
        if (!ring || ring.length < 3) return empty
        return {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    properties: { color: site!.properties.color },
                    geometry: {
                        type: 'Polygon' as const,
                        // GeoJSON requires the ring to be explicitly closed.
                        coordinates: [[...ring, ring[0]]],
                    },
                },
            ],
        }
    }, [scene.focusSitePolygon, baseData.sites])

    const onLoad = useCallback((event: MapEvent) => {
        setIsReady(true)
        if (process.env.NODE_ENV !== 'production') {
            // dev/shots.mjs reaches for this to query rendered features and to
            // check the instance is the same one after a navigation. Dev only --
            // there is no reason to hand the live map to anything in production.
            ;(window as unknown as { __ploufbagMap?: unknown }).__ploufbagMap = event.target
        }
    }, [])

    /**
     * Clicking the map is navigation, nothing more. The route change is what
     * updates the map, through the scene the new page registers -- there is no
     * separate "select this flight" path that could disagree with the URL.
     */
    const onClick = useCallback(
        (event: MapMouseEvent) => {
            const site = event.features?.find((feature) => feature.layer?.id === siteCircleLayer.id)
            if (site?.properties?.slug) {
                router.push(`/sites/${site.properties.slug}`)
                return
            }
            const flight = event.features?.find(
                (feature) => feature.layer?.id === flightHitLayer.id
            )
            if (flight?.properties?.id) {
                router.push(`/flights/${flight.properties.id}`)
            }
        },
        [router]
    )

    const onMouseMove = useCallback((event: MapMouseEvent) => {
        const site = event.features?.find((feature) => feature.layer?.id === siteCircleLayer.id)
        const flight = event.features?.find((feature) => feature.layer?.id === flightHitLayer.id)
        setHoveredSite(site?.properties?.id ? String(site.properties.id) : null)
        // Suppress the track highlight while a site is under the cursor, so the
        // hover matches what a click would do.
        setHoveredFlight(!site && flight?.properties?.id ? String(flight.properties.id) : null)
        setIsHoveringFeature(Boolean(site || flight))
    }, [])

    const onMouseLeave = useCallback(() => {
        setHoveredSite(null)
        setHoveredFlight(null)
        setIsHoveringFeature(false)
    }, [])

    if (!MAPBOX_TOKEN) {
        // The previous BaseMap logged to the console and left "Loading map..."
        // on screen forever, which reads as a hang rather than a configuration
        // problem. Now that the map is the whole page, saying so plainly matters.
        return (
            <div className={`${styles.canvas} ${styles.fallback}`}>
                <div className={styles.fallbackInner}>
                    <div className={styles.fallbackTitle}>Map unavailable</div>
                    <p className={styles.fallbackBody}>
                        NEXT_PUBLIC_MAPBOX_TOKEN is not set, so the map cannot load.
                        Everything else on the page still works.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.canvas} data-chrome={scene.chrome}>
            <Map
                id="main"
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={INITIAL_VIEW_STATE}
                mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                // Terrain is what makes a paragliding track legible -- a ridge
                // run reads as a ridge run only in relief.
                terrain={{ source: 'terrain-dem', exaggeration: 1.15 }}
                onLoad={onLoad}
                transformRequest={transformRequest}
                interactiveLayerIds={INTERACTIVE_LAYER_IDS}
                onClick={onClick}
                onMouseMove={onMouseMove}
                onMouseOut={onMouseLeave}
                cursor={isHoveringFeature ? 'pointer' : 'grab'}
                // The default attribution control is replaced below, not
                // removed: Mapbox's terms require the wordmark and the
                // attribution to stay visible. This only takes control of where
                // they sit, so the chrome can lay out around them instead of
                // burying them under a panel.
                attributionControl={false}
                logoPosition="bottom-right"
                style={{ width: '100%', height: '100%' }}
            >
                <AttributionControl compact position="bottom-right" />
                <Source
                    id="terrain-dem"
                    type="raster-dem"
                    url="mapbox://mapbox.terrain-rgb"
                    tileSize={512}
                    maxzoom={14}
                />

                {/*
                  * One source for every flight and one for every site, rather
                  * than a source per feature. promoteId lifts the feature's own
                  * id into the id slot, which is what setFeatureState needs to
                  * address a single track for hover, selection or dimming.
                  */}
                <Source
                    id={FLIGHTS_SOURCE_ID}
                    type="geojson"
                    data={baseData.flights}
                    promoteId="id"
                >
                    <Layer {...flightCasingLayer} />
                    <Layer {...flightLineLayer} />
                    <Layer {...flightHitLayer} />
                </Source>

                {/* Under the markers: the outline is context for the pin, not a
                    replacement for it. */}
                <Source id={SITE_POLYGON_SOURCE_ID} type="geojson" data={sitePolygon}>
                    <Layer {...sitePolygonFillLayer} />
                    <Layer {...sitePolygonLineLayer} />
                </Source>

                {/* After the tracks, so markers and labels are never buried. */}
                <Source id={SITES_SOURCE_ID} type="geojson" data={baseData.sites} promoteId="id">
                    <Layer {...siteCircleLayer} />
                    <Layer {...siteLabelLayer} />
                </Source>
            </Map>
            {!isReady && <div className={styles.loading}>Loading map…</div>}
        </div>
    )
}
