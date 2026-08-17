'use client'

import Link, { useLinkStatus } from 'next/link'
import { ReactNode } from 'react'
import styles from './Row.module.css'

/**
 * The stretched primary link of a row, with a pending state.
 *
 * Navigation here has no loading boundary — a root loading.tsx would let Next
 * flush the shell early, which commits the HTTP status and turns every
 * notFound() into a soft 404 (see app/error.tsx). Without one, Next holds the
 * current view until the RSC payload arrives, so a click produces *nothing* for
 * as long as that takes. On a slow connection that is indistinguishable from a
 * dead link, and it is the single thing that makes this UI feel unresponsive.
 *
 * useLinkStatus is Next's answer to exactly that: per-link pending state with no
 * Suspense boundary and no effect on status codes. The row marks itself busy,
 * so the thing you clicked is the thing that responds.
 */
function PendingFlag() {
    const { pending } = useLinkStatus()
    // Rendered as a data attribute on an empty span rather than as a class on
    // the row: only this subtree re-renders when the status changes, and the
    // row's CSS can still reach it with a sibling selector.
    return <span className={styles.pendingFlag} data-pending={pending || undefined} aria-hidden="true" />
}

export default function RowLink({
    href,
    label,
    isCurrent,
    onFocus,
    onBlur,
}: {
    href: string
    label: string
    isCurrent?: boolean
    onFocus?: () => void
    onBlur?: () => void
}): ReactNode {
    return (
        <Link
            href={href}
            className={styles.primary}
            aria-label={label}
            aria-current={isCurrent ? 'page' : undefined}
            onFocus={onFocus}
            onBlur={onBlur}
        >
            <PendingFlag />
        </Link>
    )
}
