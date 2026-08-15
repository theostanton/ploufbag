'use client'

import { useState } from 'react'
import type { Site } from '@ploufbag/common'
import SiteRow from './SiteRow'
import { PanelSection } from './Panel'
import styles from './SitesPanel.module.css'

type SiteWithFlightCount = Site & { flightCount: number }

/**
 * The /sites list, with the "only sites we have flights from" filter.
 *
 * Replaces SitesList, which was the same idea built out of about sixty lines of
 * inline styles. The filter is still client state rather than a searchParam --
 * putting it in the URL would make it shareable, which is worth doing, but it
 * belongs with the rest of the URL-state work rather than smuggled in here.
 */
export default function SitesPanel({ sites }: { sites: SiteWithFlightCount[] }) {
    const [onlyWithFlights, setOnlyWithFlights] = useState(false)

    const withFlights = sites.filter((site) => site.flightCount > 0)
    const shown = onlyWithFlights ? withFlights : sites

    return (
        <>
            <label className={styles.filter}>
                <input
                    type="checkbox"
                    checked={onlyWithFlights}
                    onChange={(event) => setOnlyWithFlights(event.target.checked)}
                />
                <span>Only sites with flights</span>
                <span className={styles.count}>
                    {shown.length} of {sites.length}
                </span>
            </label>

            <PanelSection>
                {shown.map((site) => (
                    <SiteRow key={site.ffvl_sid} site={site} />
                ))}
                {shown.length === 0 && (
                    <p className={styles.empty}>No sites have recorded flights yet.</p>
                )}
            </PanelSection>
        </>
    )
}
