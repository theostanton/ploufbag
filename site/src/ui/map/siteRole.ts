import { SITE_COLORS } from './colors'

/**
 * What a site is used for, and what colour that makes it.
 *
 * Deliberately takes `declared` as a plain string rather than importing
 * SiteType from @ploufbag/common. That package's entry point re-exports the
 * ts-postgres database layer, so a client component importing *anything* from
 * it — even an enum — drags `node:net` into the browser bundle and the route
 * fails to load. Type-only imports are fine; values are not.
 *
 * The literals below therefore mirror the site_type Postgres enum from
 * create_sites.sql, which is the same thing SiteType mirrors.
 */

export type SiteRole = 'takeoff' | 'landing' | 'both' | 'unknown'

const DECLARED_TAKEOFF = 'Takeoff'
const DECLARED_LANDING = 'Landing'

/**
 * Usage first, declaration second. `sites.type` is nullable and is null for
 * every site the FFVL sync has not classified, so how a site is actually flown
 * is the more reliable signal — and a site both flown from and landed at is a
 * different thing from one that is only landed at, which the column cannot say
 * at all.
 */
export function siteRole(
    takeoffCount: number,
    landingCount: number,
    declared: string | null
): SiteRole {
    if (takeoffCount > 0 && landingCount > 0) return 'both'
    if (takeoffCount > 0) return 'takeoff'
    if (landingCount > 0) return 'landing'
    if (declared === DECLARED_TAKEOFF) return 'takeoff'
    if (declared === DECLARED_LANDING) return 'landing'
    return 'unknown'
}

export const siteRoleColor = (role: SiteRole): string => SITE_COLORS[role]
