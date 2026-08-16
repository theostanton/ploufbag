'use client'

import Link from 'next/link'
import type { Site } from '@ploufbag/common'
import styles from './FlightRow.module.css'
import siteStyles from './SiteRow.module.css'
import { formatSiteName } from '@utils/formatSiteName'
import { siteRole, siteRoleColor } from '@ui/map/siteRole'
import { setHoveredSite, useHoveredSite } from '@ui/map/store'

/**
 * A site in a chrome panel.
 *
 * Shares FlightRow's layout so a list of sites and a list of flights read as
 * the same kind of thing, and syncs hover with the map the same way.
 */
export default function SiteRow({ site }: { site: Site & { flightCount: number } }) {
    const id = site.ffvl_sid
    const isHovered = useHoveredSite() === id

    // The list query gives a combined count, so role here comes from the
    // declared type alone; the detail view, which knows the split, is more
    // precise.
    const color = siteRoleColor(siteRole(0, 0, site.type))

    return (
        <Link
            href={`/sites/${site.slug}`}
            className={styles.row}
            data-hovered={isHovered || undefined}
            onMouseEnter={() => setHoveredSite(id)}
            onMouseLeave={() => setHoveredSite(null)}
            onFocus={() => setHoveredSite(id)}
            onBlur={() => setHoveredSite(null)}
        >
            <span className={styles.swatch} style={{ backgroundColor: color }} aria-hidden="true" />
            <span className={styles.body}>
                <span className={styles.title}>{formatSiteName(site.name)}</span>
                <span className={styles.meta}>
                    {site.alt}m{site.type ? ` · ${site.type}` : ''}
                </span>
            </span>
            <span className={styles.numbers}>
                <span className={styles.duration}>{site.flightCount}</span>
                <span className={siteStyles.unit}>
                    {site.flightCount === 1 ? 'flight' : 'flights'}
                </span>
            </span>
        </Link>
    )
}
