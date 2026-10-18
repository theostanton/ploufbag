'use client'

import { Ref, useId } from 'react'
import styles from './PanelFilter.module.css'

/**
 * The search box at the top of a list panel.
 *
 * Filters rows already on the client rather than querying: every list route
 * loads its whole collection anyway, so this is free and instant, and a
 * round-trip per keystroke would be slower and worse. If a collection ever
 * outgrows that, this becomes the place to add a debounced query.
 *
 * type="search" gives the native clear affordance, which is one less control to
 * build and the one people already know.
 *
 * `shown` is how many items match, not how many rows are on screen: a list that
 * collapses part of itself for reading (/flights' older months) is not
 * filtering, and the count should not pretend it is.
 */
export default function PanelFilter({
    ref,
    value,
    onChange,
    placeholder,
    shown,
    total,
}: {
    /** For a panel that hands focus back to the box, e.g. after "Clear search". */
    ref?: Ref<HTMLInputElement>
    value: string
    onChange: (value: string) => void
    placeholder: string
    shown: number
    total: number
}) {
    const id = useId()

    return (
        <div className={styles.filter}>
            <label className={styles.visuallyHidden} htmlFor={id}>
                {placeholder}
            </label>
            <span className={styles.icon} aria-hidden="true">⌕</span>
            <input
                ref={ref}
                id={id}
                type="search"
                className={styles.input}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                autoComplete="off"
            />
            {/* Announced politely: a filter that silently drops rows leaves a
                screen-reader user with no idea anything happened. */}
            <span className={styles.count} aria-live="polite">
                {value ? `${shown} of ${total}` : total}
            </span>
        </div>
    )
}
