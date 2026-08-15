'use client'

import { useMap } from 'react-map-gl/mapbox'
import styles from './MapControls.module.css'

/**
 * Zoom and orientation controls, positioned by the chrome rather than by
 * Mapbox.
 *
 * Mapbox's own NavigationControl anchors to a corner of the canvas, which on a
 * phone puts it underneath the bottom sheet. These sit inside the chrome layout
 * instead, so they move with the panels.
 */
export default function MapControls() {
    const { main: map } = useMap()

    if (!map) return null

    const isTilted = map.getPitch() !== 0 || map.getBearing() !== 0

    return (
        <div className={styles.controls}>
            <button
                type="button"
                className={styles.button}
                aria-label="Zoom in"
                onClick={() => map.zoomIn({ duration: 220 })}
            >
                <span aria-hidden="true">+</span>
            </button>
            <button
                type="button"
                className={styles.button}
                aria-label="Zoom out"
                onClick={() => map.zoomOut({ duration: 220 })}
            >
                <span aria-hidden="true">−</span>
            </button>
            <button
                type="button"
                className={styles.button}
                // Getting lost in 3D is easy and getting back is not obvious, so
                // this resets pitch and bearing together rather than offering a
                // compass that only fixes one of them.
                aria-label={isTilted ? 'Reset orientation to north and flat' : 'Tilt the map'}
                onClick={() =>
                    isTilted
                        ? map.easeTo({ pitch: 0, bearing: 0, duration: 400 })
                        : map.easeTo({ pitch: 55, duration: 400 })
                }
            >
                <span aria-hidden="true">{isTilted ? '⌖' : '⛰'}</span>
            </button>
        </div>
    )
}
