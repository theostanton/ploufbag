'use client'

import { ReactNode, useLayoutEffect, useRef } from 'react'
import styles from './MonthGroup.module.css'

export type MonthGroupToggle = {
    expanded: boolean
    /** Every flight in the month, whatever is on screen. */
    total: number
    /** `September 2026` */
    label: string
    onToggle: () => void
}

/**
 * One month of /flights: a heading, its rows, and -- on a month that is showing
 * only its standouts, or was expanded from that -- the row that switches
 * between the two.
 *
 * The heading is a real <h2>, so a screen reader can walk the season month by
 * month. It does not stick (Decision 5): the panel is short enough that a
 * pinned heading costs more room than it saves.
 *
 * Expanding and collapsing happen in place. The toggle stays where it was on
 * screen, the rows above it grow or shrink, and focus stays on the toggle --
 * collapsing a long month at the bottom of the panel would otherwise throw the
 * reader somewhere they never asked to go.
 */
export default function MonthGroup({
    monthKey,
    label,
    summary,
    toggle,
    children,
}: {
    monthKey: string
    label: string
    summary: string
    toggle?: MonthGroupToggle
    children: ReactNode
}) {
    const headingId = `month-${monthKey}`

    return (
        <section className={styles.group} aria-labelledby={headingId}>
            <div className={styles.head}>
                <h2 id={headingId} className={styles.label}>{label}</h2>
                <span className={styles.summary}>{summary}</span>
            </div>
            {children}
            {toggle && <ToggleRow {...toggle}/>}
        </section>
    )
}

function ToggleRow({ expanded, total, label, onToggle }: MonthGroupToggle) {
    const button = useRef<HTMLButtonElement>(null)
    // Where the button sat on screen before the click, to hold it there after.
    const anchor = useRef<number | null>(null)

    useLayoutEffect(() => {
        const top = anchor.current
        const element = button.current
        anchor.current = null
        if (top === null || !element) return
        const drift = element.getBoundingClientRect().top - top
        const scroller = scrollParent(element)
        if (drift !== 0 && scroller) scroller.scrollTop += drift
    }, [expanded])

    const text = expanded
        ? 'Show standouts only'
        : total === 1
            ? `Show 1 flight in ${label}`
            : `Show all ${total} flights in ${label}`

    return (
        <button
            ref={button}
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            onClick={() => {
                anchor.current = button.current?.getBoundingClientRect().top ?? null
                onToggle()
            }}
        >
            {text}
            <svg
                className={styles.chevron}
                data-expanded={expanded || undefined}
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
            >
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </button>
    )
}

/** The nearest ancestor that scrolls: the rail on desktop, the sheet on a phone. */
function scrollParent(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node)
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
            return node
        }
    }
    return document.scrollingElement as HTMLElement | null
}
