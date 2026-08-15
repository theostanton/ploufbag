'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Map, { Layer, MapEvent, MapMouseEvent, Source } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import styles from './MapCanvas.module.css'
import { setHoveredFlight, setHoveredSite, useScene } from './store'
import { useBaseData } from './useBaseData'
import { useMapScene } from './useMapScene'
import {
    FLIGHTS_SOURCE_ID,
    SITES_SOURCE_ID,
    flightCasingLayer,
    flightHitLayer,
    flightLineLayer,
    siteCircleLayer,
    siteLabelLayer,
} from './layers'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

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
    pitch: 45,
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
        <div className={styles.canvas} data-chrome={scene.chrome} aria-hidden="true">
            <Map
                id="main"
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={INITIAL_VIEW_STATE}
                mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                // Terrain is what makes a paragliding track legible -- a ridge
                // run reads as a ridge run only in relief.
                terrain={{ source: 'terrain-dem', exaggeration: 1.15 }}
                onLoad={onLoad}
                interactiveLayerIds={INTERACTIVE_LAYER_IDS}
                onClick={onClick}
                onMouseMove={onMouseMove}
                onMouseOut={onMouseLeave}
                cursor={isHoveringFeature ? 'pointer' : 'grab'}
                // The chrome supplies its own controls, positioned to avoid the
                // sheet; Mapbox's default attribution overlaps the mobile sheet.
                attributionControl={false}
                logoPosition="bottom-right"
                style={{ width: '100%', height: '100%' }}
            >
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
