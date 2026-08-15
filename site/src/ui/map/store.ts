'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_SCENE, Scene, SceneRegistration } from './scene'

/**
 * Shared state between the map and the chrome floating over it.
 *
 * Hand-rolled on useSyncExternalStore rather than pulling in a state library:
 * this is four fields, and the site has no state library today. The one rule
 * callers have to respect is in `useMapStore` below.
 */

export type Insets = {
    top: number
    right: number
    bottom: number
    left: number
}

export type MapState = {
    scenes: SceneRegistration[]
    /**
     * How much of the viewport the chrome is covering. The camera uses this as
     * fitBounds padding, which is what makes a flight land in the visible part
     * of the map rather than behind the sheet.
     */
    insets: Insets
    /** Feature currently under the pointer, from the map or from a list row. */
    hoveredFlightId: string | null
    hoveredSiteId: string | null
}

const EMPTY_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

const initialState: MapState = {
    scenes: [],
    insets: EMPTY_INSETS,
    hoveredFlightId: null,
    hoveredSiteId: null,
}

let state: MapState = initialState
const listeners = new Set<() => void>()

function setState(update: (previous: MapState) => MapState) {
    const next = update(state)
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

const getState = () => state
// The server has no chrome measurements and no registered scenes, so every
// render starts from the same baseline on both sides of hydration.
const getServerState = () => initialState

/**
 * Selectors MUST return a primitive or a reference that is stable across calls
 * when nothing has changed. useSyncExternalStore compares snapshots with
 * Object.is, so a selector building a fresh object each call re-renders
 * forever. The setters below preserve identity when a value is unchanged
 * precisely so that selecting a whole slice is safe.
 */
export function useMapStore<Selected>(selector: (state: MapState) => Selected): Selected {
    const getSnapshot = useCallback(() => selector(getState()), [selector])
    const getServerSnapshot = useCallback(() => selector(getServerState()), [selector])
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// ------------------------------------------------------------------- scenes

let nextSceneKey = 0

export function registerScene(scene: Scene): number {
    const key = nextSceneKey++
    setState((previous) => ({ ...previous, scenes: [...previous.scenes, { key, scene }] }))
    return key
}

export function unregisterScene(key: number) {
    setState((previous) => {
        const scenes = previous.scenes.filter((entry) => entry.key !== key)
        return scenes.length === previous.scenes.length ? previous : { ...previous, scenes }
    })
}

const selectScene = (state: MapState): Scene =>
    state.scenes.length > 0 ? state.scenes[state.scenes.length - 1].scene : DEFAULT_SCENE

/** The scene the map should currently be rendering: the most recent registration. */
export const useScene = () => useMapStore(selectScene)

// ------------------------------------------------------------------- insets

export function setInsets(insets: Insets) {
    setState((previous) => {
        const current = previous.insets
        // Identity is preserved on a no-op update because ResizeObserver fires
        // on every layout pass, most of which change nothing, and useMapStore
        // compares snapshots by reference.
        if (
            current.top === insets.top &&
            current.right === insets.right &&
            current.bottom === insets.bottom &&
            current.left === insets.left
        ) {
            return previous
        }
        return { ...previous, insets }
    })
}

const selectInsets = (state: MapState) => state.insets
export const useInsets = () => useMapStore(selectInsets)
/** For imperative callers (camera moves) that must not subscribe. */
export const getInsets = () => state.insets

// ------------------------------------------------------------------- hover

export function setHoveredFlight(id: string | null) {
    setState((previous) =>
        previous.hoveredFlightId === id ? previous : { ...previous, hoveredFlightId: id }
    )
}

export function setHoveredSite(id: string | null) {
    setState((previous) =>
        previous.hoveredSiteId === id ? previous : { ...previous, hoveredSiteId: id }
    )
}

const selectHoveredFlight = (state: MapState) => state.hoveredFlightId
const selectHoveredSite = (state: MapState) => state.hoveredSiteId
export const useHoveredFlight = () => useMapStore(selectHoveredFlight)
export const useHoveredSite = () => useMapStore(selectHoveredSite)
