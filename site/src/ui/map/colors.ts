/**
 * Track colours.
 *
 * Lifted out of FlightsMap, where it lived as a private helper, because the
 * colour is now baked into each feature's properties on the server and the map
 * styles from `['get', 'color']`. One expression paints every track, instead of
 * a layer per flight.
 */

/**
 * Ten hues, distinguishable from each other and from satellite imagery.
 *
 * These are deliberately not the brand tokens: the olive primary disappears
 * against summer alpine terrain and the cyan secondary against water and
 * shadowed snow. Tracks have to read over whatever is underneath them.
 */
const TRACK_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
    '#6366f1', // Indigo
] as const

/**
 * Stable colour per pilot-and-wing pair, so the same wing is the same colour on
 * every view without any palette state to carry around.
 *
 * The hash is the djb2-ish variant that was already in FlightsMap, kept as-is so
 * existing flights do not all change colour.
 */
export function getFlightColor(pilotId: string, wing: string): string {
    const hash = (pilotId + wing).split('').reduce((accumulator, character) => {
        accumulator = (accumulator << 5) - accumulator + character.charCodeAt(0)
        return accumulator & accumulator
    }, 0)
    return TRACK_COLORS[Math.abs(hash) % TRACK_COLORS.length]
}

/** Takeoff, landing, and sites that serve as both. */
export const SITE_COLORS = {
    takeoff: '#22c55e',
    landing: '#ef4444',
    both: '#8b5cf6',
    unknown: '#94a3b8',
} as const
