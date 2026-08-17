'use client'

import { useMemo, useState } from 'react'
import type { Site } from '@ploufbag/common'
import SiteRow from './SiteRow'
import PanelFilter from './PanelFilter'
import { PanelSection } from './Panel'
import filterStyles from './PanelFilter.module.css'
import styles from './SitesPanel.module.css'

type SiteWithFlightCount = Site & { flightCount: number }

/**
 * The /sites list: search, plus the "only sites we have flights from" toggle.
 *
 * Ordered by how much a site is flown, not alphabetically. The query returns
 * name order, which puts "Aiguillette des Houches" above "Col de la Forclaz"
 * for no reason anyone cares about — the useful question about a list of sites
 * is which ones people actually use.
 */
export default function SitesPanel({ sites }: { sites: SiteWithFlightCount[] }) {
    const [onlyWithFlights, setOnlyWithFlights] = useState(false)
    const [query, setQuery] = useState('')

    const ranked = useMemo(
        () => [...sites].sort((a, b) => b.flightCount - a.flightCount || a.name.localeCompare(b.name)),
        [sites]
    )

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return ranked.filter(
            (site) =>
                (!onlyWithFlights || site.flightCount > 0) &&
                (!needle || site.name.toLowerCase().includes(needle))
        )
    }, [ranked, onlyWithFlights, query])

    return (
        <>
            <PanelFilter
                value={query}
                onChange={setQuery}
                placeholder="Search sites"
                shown={shown.length}
                total={sites.length}
            />

            <label className={styles.filter}>
                <input
                    type="checkbox"
                    checked={onlyWithFlights}
                    onChange={(event) => setOnlyWithFlights(event.target.checked)}
                />
                <span>Only sites with flights</span>
            </label>

            <PanelSection>
                {shown.map((site) => (
                    <SiteRow key={site.ffvl_sid} site={site} />
                ))}
                {shown.length === 0 && (
                    <p className={filterStyles.empty}>
                        {query ? `No sites match “${query}”.` : 'No sites have recorded flights yet.'}
                    </p>
                )}
            </PanelSection>
        </>
    )
}
