'use client'

import { ReactNode, Ref, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './Sheet.module.css'
import { ChromeMode } from '@ui/map/scene'

/**
 * The panel the route renders into.
 *
 * Desktop: a rail down the left, with the map filling the rest.
 * Mobile:   a sheet across the bottom, draggable between three heights.
 * `glass`:  a centred panel over a map that is scenery.
 * `opaque`: the same, but solid.
 */

/**
 * Mobile snap points, as a share of the visible viewport.
 *
 * `peek` exists because of a specific problem: at the half height the sheet
 * covers enough of a portrait screen that tracks are squeezed into a strip and
 * become genuinely hard to hit. Peek hands the map back — the panel is reduced
 * to its handle and the first line of content — which is the difference between
 * the map being usable on a phone and not.
 */
const SNAPS = { peek: 0.12, half: 0.44, full: 0.88 } as const
type Snap = keyof typeof SNAPS
const SNAP_ORDER: Snap[] = ['peek', 'half', 'full']

export default function Sheet({
    ref,
    mode,
    children,
}: {
    ref: Ref<HTMLElement>
    mode: ChromeMode
    children: ReactNode
}) {
    const [snap, setSnap] = useState<Snap>('half')
    const [dragHeight, setDragHeight] = useState<number | null>(null)
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
    const innerRef = useRef<HTMLElement | null>(null)
    const pathname = usePathname()

    // A new route brings new content, and leaving the sheet where the previous
    // route left it can mean arriving at a detail view showing only a handle.
    useEffect(() => {
        setSnap('half')
    }, [pathname])

    const setRefs = useCallback(
        (element: HTMLElement | null) => {
            innerRef.current = element
            if (typeof ref === 'function') ref(element)
            else if (ref) (ref as { current: HTMLElement | null }).current = element
        },
        [ref]
    )

    const onPointerDown = useCallback((event: React.PointerEvent) => {
        const element = innerRef.current
        if (!element) return
        // Capture on the handle, so a drag that wanders off it still tracks.
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { startY: event.clientY, startHeight: element.getBoundingClientRect().height }
        setDragHeight(element.getBoundingClientRect().height)
    }, [])

    const onPointerMove = useCallback((event: React.PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        // Dragging up grows the sheet, so the delta is inverted.
        const next = drag.startHeight - (event.clientY - drag.startY)
        const limit = window.innerHeight
        setDragHeight(Math.max(limit * SNAPS.peek * 0.6, Math.min(next, limit * SNAPS.full)))
    }, [])

    const onPointerUp = useCallback(
        (event: React.PointerEvent) => {
            const drag = dragRef.current
            if (!drag) return
            dragRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)

            const height = dragHeight ?? drag.startHeight
            const share = height / window.innerHeight
            // Snap to whichever point the release was closest to, rather than to
            // the direction of travel: a small correction should not throw the
            // sheet to the far end.
            const nearest = SNAP_ORDER.reduce((best, candidate) =>
                Math.abs(SNAPS[candidate] - share) < Math.abs(SNAPS[best] - share) ? candidate : best
            )
            setSnap(nearest)
            setDragHeight(null)
        },
        [dragHeight]
    )

    const cycle = useCallback(() => {
        // Keyboard and assistive-technology path: the handle is a button, and
        // pressing it steps through the snaps. Dragging is not reachable
        // otherwise.
        setSnap((current) => SNAP_ORDER[(SNAP_ORDER.indexOf(current) + 1) % SNAP_ORDER.length])
    }, [])

    return (
        <section
            ref={setRefs}
            className={styles.sheet}
            data-mode={mode}
            data-snap={snap}
            data-dragging={dragHeight !== null || undefined}
            style={
                dragHeight !== null
                    ? ({ '--sheet-drag-height': `${dragHeight}px` } as React.CSSProperties)
                    : undefined
            }
            aria-label="Details"
        >
            {mode === 'sheet' && (
                <button
                    type="button"
                    className={styles.handle}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={cycle}
                    aria-label={`Resize panel (currently ${snap})`}
                >
                    <span className={styles.handleBar} aria-hidden="true" />
                </button>
            )}
            <div className={styles.scroller}>{children}</div>
        </section>
    )
}
