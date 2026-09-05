/**
 * Track colours.
 *
 * The palette and the hash now live in `@ploufbag/common` as trackColours.ts,
 * because they are reproduced in SQL — track_colour() in create_wings.sql — so
 * that the wings backfill can freeze each glider into the colour its tracks were
 * already appearing in. Two implementations that have to agree exactly should
 * not sit in a package the other cannot import.
 */
// Deep import, and it has to be. `@ploufbag/common` is a barrel that re-exports
// ./database -- ts-postgres and generic-pool -- and it compiles to CommonJS with
// no sideEffects flag, so no bundler can tree-shake that back out. A *value*
// imported from the barrel by anything in a client graph therefore drags Node's
// `net` into the browser bundle, where it fails to resolve and takes the route's
// error boundary with it. That is what broke /flights and /sites: server HTML
// rendered fine, hydration threw, and the page showed "Something went wrong".
//
// siteRole.ts next door already carries this warning. This file is what happens
// when it is not heeded. Type-only imports from the barrel are fine.
import { flightTrackColour } from '@ploufbag/common/dist/trackColours'

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
