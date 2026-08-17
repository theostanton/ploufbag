'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Escape leaves a detail view for the list it belongs to.
 *
 * The panel behaves like a dialog over the map — it appears above the thing you
 * were looking at and you want it gone — so Escape is the key people already
 * reach for. Without it the only way out is finding the back link.
 *
 * A push to the parent path, not router.back(). Back can leave the site
 * entirely: these detail URLs are published in Strava descriptions, so arriving
 * cold on one is the common case, and there is nothing behind it.
 */
const PARENTS: Array<{ pattern: RegExp; parent: string }> = [
    { pattern: /^\/flights\/[^/]+$/, parent: '/flights' },
    { pattern: /^\/sites\/[^/]+$/, parent: '/sites' },
    // Most specific first: the wing route returns to its pilot, not to /pilots.
    { pattern: /^\/pilots\/([^/]+)\/[^/]+$/, parent: '/pilots/$1' },
    { pattern: /^\/pilots\/[^/]+$/, parent: '/pilots' },
]

export function useEscapeToParent() {
    const pathname = usePathname()
    const router = useRouter()

    useEffect(() => {
        const match = PARENTS.find((entry) => entry.pattern.test(pathname))
        if (!match) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return

            // Never steal Escape from something using it: a native search input
            // clears on Escape, and a future dialog will want it first.
            const active = document.activeElement
            if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
                return
            }

            router.push(pathname.replace(match.pattern, match.parent))
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [pathname, router])
}
