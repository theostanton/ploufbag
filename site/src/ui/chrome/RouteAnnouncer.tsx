'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './RouteAnnouncer.module.css'

/**
 * Announces the new view to assistive technology after a navigation.
 *
 * A full page load moves focus and re-announces the document; a client-side
 * route change does neither. That was already true of the old site, but it
 * matters much more now: the whole application is one document, the map never
 * remounts, and only the contents of one panel change. Without this, following
 * a link is completely silent to a screen reader.
 *
 * Deliberately an announcement rather than a focus move. Sending focus to the
 * panel on every navigation would fight anyone tabbing through the flight list
 * — clicking a row would yank them back to the top of the panel that replaced
 * it. Reading the new title leaves focus where the user put it.
 */
export default function RouteAnnouncer() {
    const pathname = usePathname()
    const [message, setMessage] = useState('')
    const isFirstRender = useRef(true)

    useEffect(() => {
        // Nothing to announce on first paint: the page load already did it.
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        // A frame's delay lets the new panel commit, so document.title is the
        // incoming route's rather than the outgoing one's.
        const timer = window.setTimeout(() => setMessage(document.title), 120)
        return () => window.clearTimeout(timer)
    }, [pathname])

    return (
        <p aria-live="polite" aria-atomic="true" className={styles.announcer}>
            {message}
        </p>
    )
}
