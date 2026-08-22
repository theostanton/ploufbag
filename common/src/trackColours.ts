/**
 * The palette every flight track is drawn in, and the hash that picks from it.
 *
 * This lived in the site's map code as a private helper. It has moved here
 * because it is now reproduced in SQL -- track_colour() in create_wings.sql --
 * so that backfill_wings can freeze each wing into the colour its tracks were
 * already appearing in. Two implementations that must agree exactly should not
 * live in packages that cannot import each other; wingColour.test.ts asserts
 * they still do.
 */

/**
 * Ten hues, distinguishable from each other and from satellite imagery.
 *
 * These are deliberately not the brand tokens: the olive primary disappears
 * against summer alpine terrain and the cyan secondary against water and
 * shadowed snow. Tracks have to read over whatever is underneath them.
 *
 * The order is load-bearing. It is an index into this array that a hash selects,
 * so inserting or reordering a colour repaints every existing track -- and, now
 * that wings store their colour, silently disagrees with every row the backfill
 * has already written.
 */
export const TRACK_COLOURS = [
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
 * Stable colour for an arbitrary key.
 *
 * The djb2-ish variant that was already in the map code, kept exactly as it was
 * so that no existing flight changes colour. `| 0` is the ToInt32 coercion the
 * original expressed as `accumulator & accumulator`; it is what keeps the hash
 * inside 32 bits, and the SQL twin depends on it.
 */
export function trackColourFor(key: string): string {
    let hash = 0
    for (let index = 0; index < key.length; index++) {
        hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0
    }
    return TRACK_COLOURS[Math.abs(hash) % TRACK_COLOURS.length]
}

/**
 * The colour a pilot's tracks on a given wing are drawn in, before that wing has
 * a colour of its own.
 *
 * The `'unknown'` fallback is not decoration: it is the string every caller was
 * already passing for a missing wing, so it is part of the hash input and has to
 * stay exactly here to keep those tracks their existing colour.
 */
export function flightTrackColour(pilotId: string | number, wing: string | null | undefined): string {
    return trackColourFor(`${pilotId}${wing || 'unknown'}`)
}
