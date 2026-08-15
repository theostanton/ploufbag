'use client'

import { useEffect } from 'react'
import { Scene } from './scene'
import { registerScene, unregisterScene } from './store'

/**
 * Declares what the map should show while this route is on screen. Renders
 * nothing.
 *
 * Server components cannot call hooks, so a page cannot talk to the map store
 * directly. It renders one of these instead -- the same trick next/head used --
 * and the data it already fetched flows straight through:
 *
 *     <MapScene chrome="sheet" emphasis={{ flights: [flight.strava_activity_id] }} />
 */
export default function MapScene(props: Scene) {
    // Props arrive as fresh object literals on every render, so the effect is
    // keyed on a serialisation rather than on the props themselves. A scene is a
    // handful of ids and flags; stringifying it is far cheaper than the
    // re-registration churn reference equality would cause.
    const serialised = JSON.stringify(props)

    // Register and unregister in the same effect, so a StrictMode
    // mount/unmount/mount cycle ends with the scene registered. Splitting the
    // cleanup into its own effect loses the scene entirely on the second mount,
    // because the registering effect's dependencies have not changed and it
    // does not run again.
    useEffect(() => {
        const key = registerScene(JSON.parse(serialised) as Scene)
        return () => unregisterScene(key)
    }, [serialised])

    return null
}
