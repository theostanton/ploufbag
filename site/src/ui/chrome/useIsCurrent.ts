'use client'

import { usePathname } from 'next/navigation'

/**
 * Whether a row's target is the view currently open.
 *
 * The map and the panel are looking at the same thing, so the list should say
 * which one. Without it you can be reading a flight's detail view with its row
 * in the list beside it styled exactly like the other hundred and sixty-four.
 */
export function useIsCurrent(href: string): boolean {
    return usePathname() === href
}
