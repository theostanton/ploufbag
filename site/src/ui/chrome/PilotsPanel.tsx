'use client'

import { useMemo, useState } from 'react'
import PilotRow, { PilotListEntry } from './PilotRow'
import PanelFilter from './PanelFilter'
import { PanelSection } from './Panel'
import styles from './PanelFilter.module.css'

/** The /pilots list, filterable by name. */
export default function PilotsPanel({ pilots }: { pilots: PilotListEntry[] }) {
    const [query, setQuery] = useState('')

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return pilots
        return pilots.filter((pilot) => pilot.first_name.toLowerCase().includes(needle))
    }, [pilots, query])

    return (
        <>
            <PanelFilter
                value={query}
                onChange={setQuery}
                placeholder="Search pilots"
                shown={shown.length}
                total={pilots.length}
            />
            <PanelSection>
                {shown.map((pilot) => (
                    <PilotRow key={pilot.pilot_id} pilot={pilot} />
                ))}
                {shown.length === 0 && (
                    <p className={styles.empty}>No pilots match “{query}”.</p>
                )}
            </PanelSection>
        </>
    )
}
