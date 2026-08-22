/**
 * Track colours.
 *
 * The palette and the hash now live in `@ploufbag/common` as trackColours.ts,
 * because they are reproduced in SQL — track_colour() in create_wings.sql — so
 * that the wings backfill can freeze each glider into the colour its tracks were
 * already appearing in. Two implementations that have to agree exactly should
 * not sit in a package the other cannot import.
 */
import { flightTrackColour } from '@ploufbag/common'

/**
 * The colour a flight's track is drawn in.
 *
 * A wing that exists as a row carries its own colour, chosen by the pilot, and
 * that always wins. Everything else falls back to hashing the pilot and wing
 * together, which is what every track was coloured by before wings had colours —
 * so a flight whose wing predates the backfill, or which has no wing at all,
 * keeps exactly the hue it has today.
 *
 * @param wingColour the wing's own colour, when the query joined it.
 */
export function getFlightColor(
    pilotId: string,
    wing: string | null | undefined,
    wingColour?: string | null
): string {
    return wingColour || flightTrackColour(pilotId, wing)
}

/** Takeoff, landing, and sites that serve as both. */
export const SITE_COLORS = {
    takeoff: '#22c55e',
    landing: '#ef4444',
    both: '#8b5cf6',
    unknown: '#94a3b8',
} as const
