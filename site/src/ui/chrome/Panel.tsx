import Link from 'next/link'
import { ReactNode } from 'react'
import styles from './Panel.module.css'

/**
 * Standard furniture for a chrome panel: a title, an optional subtitle, and an
 * optional way back up.
 *
 * The back link replaces the old Breadcrumb, which lived in the layout and
 * refetched pilot and site names client-side on every navigation from
 * /api/pilots/[id] and /api/sites/[slug] -- data the server component rendering
 * the page already had in hand. Here the label is just a prop.
 *
 * It is a Link to the parent path rather than a history back(): back can leave
 * the site entirely when a flight was opened from a Strava short-link, which is
 * how most people arrive at one.
 */
export function PanelHeader({
    title,
    subtitle,
    back,
    accent,
}: {
    title: ReactNode
    subtitle?: ReactNode
    back?: { href: string; label: string }
    /** Colour bar tying the panel to the thing it describes on the map. */
    accent?: string
}) {
    return (
        <header className={styles.header}>
            {back && (
                <Link href={back.href} className={styles.back}>
                    <span aria-hidden="true">←</span> {back.label}
                </Link>
            )}
            <h1 className={styles.title}>
                {accent && (
                    <span
                        className={styles.accent}
                        style={{ backgroundColor: accent }}
                        aria-hidden="true"
                    />
                )}
                {title}
            </h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>
    )
}

/** A titled block within a panel. */
export function PanelSection({
    title,
    action,
    children,
}: {
    title?: ReactNode
    action?: ReactNode
    children: ReactNode
}) {
    return (
        <section className={styles.section}>
            {(title || action) && (
                <div className={styles.sectionHead}>
                    {title && <h2 className={styles.sectionTitle}>{title}</h2>}
                    {action}
                </div>
            )}
            {children}
        </section>
    )
}

/** Key/value pairs, two across. The panel's workhorse. */
export function PanelFacts({ facts }: { facts: Array<{ label: string; value: ReactNode }> }) {
    return (
        <dl className={styles.facts}>
            {facts.map((fact) => (
                <div key={fact.label} className={styles.fact}>
                    <dt className={styles.factLabel}>{fact.label}</dt>
                    <dd className={styles.factValue}>{fact.value}</dd>
                </div>
            ))}
        </dl>
    )
}

/** What a route renders when its query came back empty or failed. */
export function PanelEmpty({ title, detail }: { title: string; detail?: ReactNode }) {
    return (
        <div className={styles.empty}>
            <p className={styles.emptyTitle}>{title}</p>
            {detail && <p className={styles.emptyDetail}>{detail}</p>}
        </div>
    )
}
