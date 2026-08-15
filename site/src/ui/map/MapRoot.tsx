'use client'

import { ReactNode } from 'react'
import { MapProvider } from 'react-map-gl/mapbox'
import MapCanvas from './MapCanvas'
import Chrome from '@ui/chrome/Chrome'

/**
 * The client boundary that holds the map and the chrome.
 *
 * Rendered by the root layout, which the App Router does not remount between
 * routes -- so everything inside survives navigation. `topBar` and `children`
 * arrive as already-rendered server components; passing them through as props
 * keeps them on the server rather than dragging every page into the client
 * bundle.
 *
 * MapProvider is react-map-gl's, and it is what lets MapControls (and anything
 * else in the chrome) reach the map with useMap().main without a ref being
 * threaded down by hand.
 */
export default function MapRoot({ topBar, children }: { topBar: ReactNode; children: ReactNode }) {
    return (
        <MapProvider>
            <MapCanvas />
            <Chrome topBar={topBar}>{children}</Chrome>
        </MapProvider>
    )
}
