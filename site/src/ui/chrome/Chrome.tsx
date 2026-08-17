'use client'

import { ReactNode, useCallback, useEffect, useRef } from 'react'
import styles from './Chrome.module.css'
import Sheet from './Sheet'
import MapControls from './MapControls'
import RouteAnnouncer from './RouteAnnouncer'
import { useEscapeToParent } from './useEscapeToParent'
import { setInsets, useInsets, useScene } from '@ui/map/store'

/**
 * Everything that floats over the map.
 *
 * The container covers the viewport but is transparent to the pointer; each
 * panel inside re-enables pointer events for itself. Without that, an invisible
 * full-screen div would swallow every pan and zoom.
 *
 * Chrome also owns the measuring. The camera needs to know how much of the
 * viewport the panels are covering so it can frame content in the part that is
 * actually visible, and doing that in one place beats each panel reporting its
 * own edge and racing the others.
 */
export default function Chrome({
    topBar,
    signup,
    children,
}: {
    topBar: ReactNode
    /** The floating upsell. A server component, passed through like topBar. */
    signup: ReactNode
    children: ReactNode
}) {
    const scene = useScene()
    const insets = useInsets()
    useEscapeToParent()
    const topBarRef = useRef<HTMLDivElement>(null)
    const sheetRef = useRef<HTMLElement>(null)

    const measure = useCallback(() => {
        const topBarRect = topBarRef.current?.getBoundingClientRect()
        const sheetRect = sheetRef.current?.getBoundingClientRect()

        const top = topBarRect ? Math.round(topBarRect.bottom) : 0
        if (!sheetRect) {
            setInsets({ top, right: 0, bottom: 0, left: 0 })
            return
        }

        // Which edge the sheet is docked to is a layout decision made in CSS, so
        // infer it from where the sheet actually is rather than duplicating the
        // breakpoint here and letting the two drift.
        //
        // Infer it from how much of the *width* the sheet spans, not from
        // whether it is taller than it is wide. The aspect-ratio test looked
        // equivalent and was not: on a 390px phone the sheet is 366 wide and,
        // at the half snap, 371 tall — taller than wide by five pixels, so
        // every phone was classified as a desktop rail. Two things broke
        // quietly as a result. `bottom` stayed 0, so the floating signup card
        // sat on top of the sheet and covered the list underneath it; and the
        // camera was told to pad 378px off the left of a 390px viewport, which
        // is why the mobile map framed the whole of western Europe.
        //
        // A rail is narrow and full-height; a sheet spans the width. 0.75 sits
        // far from both cases (0.29 on a 1440px desktop, 0.94 on a 390px
        // phone), so a change to either width cannot flip the classification.
        const isSideRail = sheetRect.width / window.innerWidth < 0.75
        if (isSideRail) {
            setInsets({ top, right: 0, bottom: 0, left: Math.round(sheetRect.right) })
        } else {
            setInsets({
                top,
                right: 0,
                bottom: Math.round(window.innerHeight - sheetRect.top),
                left: 0,
            })
        }
    }, [])

    useEffect(() => {
        measure()
        const observer = new ResizeObserver(measure)
        if (topBarRef.current) observer.observe(topBarRef.current)
        if (sheetRef.current) observer.observe(sheetRef.current)
        window.addEventListener('resize', measure)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [measure, scene.chrome])

    return (
        <div
            className={styles.chrome}
            data-chrome={scene.chrome}
            // Republished as a custom property so floating children can sit
            // clear of the sheet. They are siblings of the map canvas, not
            // descendants, so they cannot inherit the copy MapCanvas sets.
            style={{ '--map-bottom-inset': `${insets.bottom}px` } as React.CSSProperties}
        >
            <div className={styles.topBar} ref={topBarRef}>
                {topBar}
            </div>
            <Sheet ref={sheetRef} mode={scene.chrome}>
                {children}
            </Sheet>
            {scene.chrome === 'sheet' && <MapControls />}
            {/* Only over the map. On the glass and opaque routes the panel is
                the page, and the home page already makes the pitch itself. */}
            {scene.chrome === 'sheet' && signup}
            <RouteAnnouncer />
        </div>
    )
}
