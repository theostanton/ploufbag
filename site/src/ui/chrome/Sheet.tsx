'use client'

import { ReactNode, Ref } from 'react'
import styles from './Sheet.module.css'
import { ChromeMode } from '@ui/map/scene'

/**
 * The panel the route renders into.
 *
 * Desktop: a rail down the left, with the map filling the rest.
 * Mobile:   a sheet across the bottom.
 * `glass`:  a centred panel, for routes that are not map views.
 * `opaque`: the same, but solid -- dense tables over satellite imagery are
 *           unreadable, so admin and the styleguide opt out of the effect.
 *
 * Drag-to-resize on mobile lands in a later pass; the snap points below are
 * fixed for now.
 */
export default function Sheet({
    ref,
    mode,
    children,
}: {
    ref: Ref<HTMLElement>
    mode: ChromeMode
    children: ReactNode
}) {
    return (
        <section ref={ref} className={styles.sheet} data-mode={mode}>
            <div className={styles.scroller}>{children}</div>
        </section>
    )
}
