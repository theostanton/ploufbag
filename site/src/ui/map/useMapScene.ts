'use client'

import { useEffect, useRef } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import { useMap } from 'react-map-gl/mapbox'
import { boundsForScene, fitBounds } from './camera'
import { FLIGHTS_SOURCE_ID, SITES_SOURCE_ID, opacityPaint } from './layers'
import type { BaseDataState } from './useBaseData'
import { useHoveredFlight, useHoveredSite, useInsets, useScene } from './store'

/**
 * Applies the current scene to the live map: emphasis, then camera.
 *
 * This is the reconciler. It runs inside MapCanvas, which never unmounts, so it
 * sees every route change as a plain state update rather than as a teardown.
 */

type FeatureRef = { source: string; id: string }

function setFeatureStates(
    map: MapboxMap,
    previous: FeatureRef[],
    next: FeatureRef[],
    key: 'selected' | 'hover'
) {
    const nextKeys = new Set(next.map((entry) => `${entry.source}:${entry.id}`))
    for (const entry of previous) {
        if (nextKeys.has(`${entry.source}:${entry.id}`)) continue
        // removeFeatureState rather than setting false: a lingering `false`
        // still counts as state and keeps the feature in Mapbox's dirty set.
        try {
            map.removeFeatureState({ source: entry.source, id: entry.id }, key)
        } catch {
            // The source can be gone if the style reloaded underneath us.
        }
    }
    for (const entry of next) {
        try {
            map.setFeatureState({ source: entry.source, id: entry.id }, { [key]: true })
        } catch {
            // Setting state for a feature the source does not have is harmless
            // and happens whenever a scene names a flight outside the dataset.
        }
    }
}

export function useMapScene(baseData: BaseDataState, isReady: boolean) {
    const { main: map } = useMap()
    const scene = useScene()
    const insets = useInsets()
    const hoveredFlightId = useHoveredFlight()
    const hoveredSiteId = useHoveredSite()

    const selectedRef = useRef<FeatureRef[]>([])
    const hoveredRef = useRef<FeatureRef[]>([])
    const modeRef = useRef<'normal' | 'focused' | null>(null)
    // The opening view is set by initialViewState; animating away from it on
    // first paint looks like a glitch rather than a transition.
    const hasFramedRef = useRef(false)

    const dataReady = baseData.status === 'ready'

    // ------------------------------------------------------------- emphasis
    useEffect(() => {
        if (!map || !isReady || !dataReady) return

        // MapRef proxies only part of the Mapbox API -- setPaintProperty is not
        // among the methods it forwards -- so mutations go through the
        // underlying instance.
        const gl = map.getMap()

        const next: FeatureRef[] = [
            ...(scene.emphasis?.flights ?? []).map((id) => ({ source: FLIGHTS_SOURCE_ID, id })),
            ...(scene.emphasis?.sites ?? []).map((id) => ({ source: SITES_SOURCE_ID, id })),
        ]
        setFeatureStates(gl, selectedRef.current, next, 'selected')
        selectedRef.current = next

        const mode = scene.emphasis?.dimOthers ? 'focused' : 'normal'
        if (modeRef.current !== mode) {
            for (const { layer, property, value } of opacityPaint(mode)) {
                if (gl.getLayer(layer)) {
                    gl.setPaintProperty(layer, property, value as never)
                }
            }
            modeRef.current = mode
        }
    }, [map, isReady, dataReady, scene])

    // ---------------------------------------------------------------- hover
    useEffect(() => {
        if (!map || !isReady || !dataReady) return
        const next: FeatureRef[] = []
        if (hoveredFlightId) next.push({ source: FLIGHTS_SOURCE_ID, id: hoveredFlightId })
        if (hoveredSiteId) next.push({ source: SITES_SOURCE_ID, id: hoveredSiteId })
        setFeatureStates(map.getMap(), hoveredRef.current, next, 'hover')
        hoveredRef.current = next
    }, [map, isReady, dataReady, hoveredFlightId, hoveredSiteId])

    // --------------------------------------------------------------- camera
    useEffect(() => {
        if (!map || !isReady || !dataReady) return
        const bounds = boundsForScene(scene, baseData.flights, baseData.sites)
        if (!bounds) return
        fitBounds(map, bounds, insets, hasFramedRef.current)
        hasFramedRef.current = true
        // `insets` is deliberately excluded. It changes on every chrome resize --
        // including the one that fires while the camera is easing -- and
        // re-fitting mid-animation fights the user. The next scene change picks
        // up the current value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, isReady, dataReady, scene, baseData.flights, baseData.sites])
}
