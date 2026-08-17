'use client'

import { useEffect, useState } from 'react'
import styles from './SignupCard.module.css'

const DISMISSED_KEY = 'ploufbag:signup-dismissed'

/**
 * The dismissable shell around the floating upsell.
 *
 * Client-only because dismissal is client state; the pitch itself and the
 * capacity check stay on the server in SignupChrome, so a signed-in visitor or
 * a full waitlist costs nothing here.
 *
 * Dismissal lives in sessionStorage, not localStorage. Someone who closes this
 * while reading one flight has said "not now", not "never" — and a permanent
 * dismissal from a single impulse serves neither them nor the product. It comes
 * back next visit.
 *
 * Rendered hidden until the effect has run, rather than shown then removed:
 * the server cannot know whether this session dismissed it, so showing first
 * would flash the card at everyone who already said no.
 */
export default function SignupCard({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<'unknown' | 'visible' | 'dismissed'>('unknown')

    useEffect(() => {
        try {
            setState(sessionStorage.getItem(DISMISSED_KEY) ? 'dismissed' : 'visible')
        } catch {
            // Private browsing and some embedded webviews throw on access.
            // Showing the card is the safe default.
            setState('visible')
        }
    }, [])

    const dismiss = () => {
        setState('dismissed')
        try {
            sessionStorage.setItem(DISMISSED_KEY, '1')
        } catch {
            // Dismissal will not persist across navigations here; still better
            // than leaving the card on screen after it was closed.
        }
    }

    if (state !== 'visible') return null

    return (
        <aside className={styles.card} aria-label="Connect your Strava account">
            <button
                type="button"
                className={styles.close}
                onClick={dismiss}
                aria-label="Dismiss"
            >
                <span aria-hidden="true">×</span>
            </button>
            {children}
        </aside>
    )
}
