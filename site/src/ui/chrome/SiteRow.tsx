'use client'

import type { Site } from '@ploufbag/common'
import styles from './Row.module.css'
import { formatSiteName } from '@utils/formatSiteName'
import { siteRole, siteRoleColor } from '@ui/map/siteRole'
import { setHoveredSite, useIsSiteHovered } from '@ui/map/store'
import { useIsCurrent } from './useIsCurrent'
import RowLink from './RowLink'

/**
 * A site in a chrome panel.
 *
 * Shares the row layout with flights and pilots so the three lists read as the
 * same kind of thing, and syncs hover with the map the same way.
 */
export default function SiteRow({ site }: { site: Site & { flightCount: number } }) {
    const id = site.ffvl_sid
    const href = `/sites/${site.slug}`
    const isHovered = useIsSiteHovered(id)
    const isCurrent = useIsCurrent(href)

    // The list query gives a combined count, so role here comes from the
    // declared type alone; the detail view, which knows the split, is more
    // precise.
    const color = siteRoleColor(siteRole(0, 0, site.type))
    const name = formatSiteName(site.name)

    return (
        <div
            className={styles.row}
            data-hovered={isHovered || undefined}
            data-current={isCurrent || undefined}
            onMouseEnter={() => setHoveredSite(id)}
            onMouseLeave={() => setHoveredSite(null)}
        >
            <RowLink
                href={href}
                label={`${name}, ${site.flightCount} flights`}
                isCurrent={isCurrent}
                onFocus={() => setHoveredSite(id)}
                onBlur={() => setHoveredSite(null)}
            />

            <span className={styles.swatch} style={{ backgroundColor: color }} aria-hidden="true" />

            <span className={styles.body}>
                <span className={styles.title}>{name}</span>
                <span className={styles.meta}>
                    {site.alt}m{site.type ? ` · ${site.type}` : ''}
                </span>
            </span>

            <span className={styles.numbers}>
                <span className={styles.primaryValue}>{site.flightCount}</span>
                <span className={styles.unit}>
                    {site.flightCount === 1 ? 'flight' : 'flights'}
                </span>
            </span>

            <span className={styles.chevron} aria-hidden="true">›</span>
        </div>
    )
}
