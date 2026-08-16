'use client'

import { useEffect } from 'react'
import { useMap } from 'react-map-gl/mapbox'

/**
 * A slow orbit for routes where the map is scenery rather than data.
 *
 * On sign-in and the landing page there is nothing to select and nothing to
 * frame, so the map earns its place by moving — barely. Roughly a degree and a
 * half of bearing per second: enough that the terrain reads as three
 * dimensional, slow enough that nobody trying to read the panel over it notices
 * it happening.
 *
 * It gives way to the user, permanently. Four things stop it:
 *
 *   - prefers-reduced-motion, which means it never starts.
 *   - The tab going to the background, where it would burn battery animating
 *     something nobody is looking at.
 *   - Any interaction with the map. Someone who has grabbed the map has a
 *     destination in mind, and wrestling them for the camera is intolerable.
 *   - Leaving the route.
 *
 * Only the tab-visibility pause resumes. The others are decisions.
 */
const DEGREES_PER_SECOND = 1.5

export function useAmbientDrift(enabled: boolean) {
    const { main: map } = useMap()

    useEffect(() => {
        if (!map || !enabled) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        const gl = map.getMap()
        let frame = 0
        let lastTime = 0
        let surrendered = false

        const surrender = () => {
            surrendered = true
            stop()
        }

        const step = (time: number) => {
            if (surrendered) return
            if (lastTime !== 0) {
                // Drive rotation from elapsed time, not per frame: a 120Hz
                // display would otherwise spin twice as fast as a 60Hz one.
                const elapsed = (time - lastTime) / 1000
                gl.setBearing(gl.getBearing() + DEGREES_PER_SECOND * elapsed)
            }
            lastTime = time
            frame = requestAnimationFrame(step)
        }

        const start = () => {
            if (surrendered || frame !== 0) return
            // Reset the clock, so a pause does not turn into one huge jump on
            // the first frame after resuming.
            lastTime = 0
            frame = requestAnimationFrame(step)
        }

        const stop = () => {
            if (frame !== 0) cancelAnimationFrame(frame)
            frame = 0
        }

        const onVisibilityChange = () => (document.hidden ? stop() : start())

        // dragstart/zoomstart/rotatestart fire for programmatic moves too, so
        // listen for the input events instead -- otherwise the camera's own
        // easing would count as the user taking over.
        const surrenderEvents = ['mousedown', 'touchstart', 'wheel', 'keydown'] as const
        const canvas = gl.getCanvasContainer()
        surrenderEvents.forEach((name) => canvas.addEventListener(name, surrender, { passive: true }))
        document.addEventListener('visibilitychange', onVisibilityChange)

        start()

        return () => {
            stop()
            surrenderEvents.forEach((name) => canvas.removeEventListener(name, surrender))
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [map, enabled])
}
