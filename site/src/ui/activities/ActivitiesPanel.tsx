'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    flightTrackColour,
    type ActivityRow,
    type ActivityVerdict,
    type VerdictCounts,
} from '@ploufbag/common'
import { setActivityVerdict, setFlightWing } from '@actions/activities'
import { GENERIC_ACTION_ERROR, type ActionResult } from '@model/ActionResult'
import TrackThumb from './TrackThumb'
import ReviewDeck from './ReviewDeck'
import styles from './Activities.module.css'

export type PanelWing = {
    wing_id: string
    name: string
    colour: string
    retired: boolean
}

/** What a flight row knows about its wing, joined in by the page. */
export type FlightWingLink = {
    strava_activity_id: string
    wing_id: string | null
    wing: string | null
    wing_colour: string | null
}

const TABS: Array<{ verdict: ActivityVerdict; label: string }> = [
    { verdict: 'flight', label: 'Flights' },
    { verdict: 'unsure', label: 'Unsure' },
    { verdict: 'not_flight', label: 'Not flights' },
]

function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}min`
}

/**
 * Every Strava activity a pilot has, and what we make of each one.
 *
 * Three lists, not one, and the third is the important one: the activities we
 * decided were *not* flights are listed too, because "why isn't my flight here?"
 * has to be answerable. Hiding them would make the product's biggest failure
 * mode invisible again, which is what it was before this screen existed.
 *
 * Selection and bulk actions, because the honest answer to a pile of seventeen
 * maybes is usually "yes, all of them", and making someone tap seventeen times
 * to say so is how a review queue becomes a chore nobody finishes.
 */
export default function ActivitiesPanel({
    activities,
    counts,
    wings,
    flightWings,
}: {
    activities: ActivityRow[]
    counts: VerdictCounts
    wings: PanelWing[]
    flightWings: FlightWingLink[]
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [tab, setTab] = useState<ActivityVerdict>(counts.unsure > 0 ? 'unsure' : 'flight')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [notice, setNotice] = useState<string | null>(null)
    const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [wingMenuFor, setWingMenuFor] = useState<string | null>(null)
    const [deck, setDeck] = useState(false)

    const wingByFlight = useMemo(() => {
        const map = new Map<string, FlightWingLink>()
        for (const link of flightWings) map.set(link.strava_activity_id, link)
        return map
    }, [flightWings])

    const visible = useMemo(
        () => activities.filter(activity => (activity.pilot_verdict ?? activity.verdict) === tab),
        [activities, tab]
    )

    function run(
        action: () => Promise<ActionResult>,
        options: { undoIds?: string[]; undoLabel?: string } = {}
    ) {
        setError(null)
        startTransition(async () => {
            const result = await action()
            if (!result.ok) {
                setError(result.error ?? GENERIC_ACTION_ERROR)
                return
            }
            setNotice(result.message ?? null)
            setSelected(new Set())
            setWingMenuFor(null)
            // Every bulk action gets an undo. The whole screen leans on acting
            // on twenty things at once, and bulk without undo is a trap.
            setUndo(options.undoIds?.length ? { ids: options.undoIds, label: options.undoLabel ?? 'Undo' } : null)
            router.refresh()
        })
    }

    function toggle(id: string) {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
    }

    const selectedIds = Array.from(selected)
    const allVisibleSelected = visible.length > 0 && visible.every(a => selected.has(a.strava_activity_id))

    return (
        <div className={styles.panel}>
            <div className={styles.tabs} role="tablist">
                {TABS.map(({ verdict, label }) => (
                    <button
                        key={verdict}
                        type="button"
                        role="tab"
                        aria-selected={tab === verdict}
                        className={styles.tab}
                        data-active={tab === verdict || undefined}
                        onClick={() => {
                            setTab(verdict)
                            setSelected(new Set())
                        }}
                    >
                        {label}
                        <span className={styles.tabCount}>{counts[verdict]}</span>
                    </button>
                ))}
            </div>

            {tab === 'unsure' && visible.length > 0 && !deck && (
                <>
                    <p className={styles.blurb}>
                        We could not call these. Look at the shape — a flight leaves a launch and
                        goes somewhere. Everything here stays put until you decide, or don’t.
                    </p>
                    <button
                        type="button"
                        className={`${styles.linkish} ${styles.modeToggle}`}
                        onClick={() => setDeck(true)}
                    >
                        Review one at a time
                    </button>
                </>
            )}

            {tab === 'unsure' && deck && (
                <ReviewDeck
                    activities={visible}
                    busy={isPending}
                    onDecide={(activityId, isFlight) =>
                        run(
                            () => setActivityVerdict([activityId], isFlight ? 'flight' : 'not_flight'),
                            { undoIds: [activityId] }
                        )
                    }
                    onAcceptRest={ids => run(() => setActivityVerdict(ids, 'flight'), { undoIds: ids })}
                    onExit={() => setDeck(false)}
                />
            )}
            {tab === 'not_flight' && visible.length > 0 && (
                <p className={styles.blurb}>
                    Activities we set aside. They are listed so that a flight of yours can never go
                    missing without an answer.
                </p>
            )}

            {deck && tab === 'unsure' ? null : visible.length === 0 ? (
                <p className={styles.empty}>
                    {tab === 'unsure'
                        ? 'Nothing waiting on you.'
                        : tab === 'flight'
                            ? 'No flights yet.'
                            : 'Nothing set aside.'}
                </p>
            ) : (
                <>
                    <div className={styles.listHead}>
                        <label className={styles.selectAll}>
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={() =>
                                    setSelected(
                                        allVisibleSelected
                                            ? new Set()
                                            : new Set(visible.map(a => a.strava_activity_id))
                                    )
                                }
                            />
                            <span>
                                {allVisibleSelected ? 'Clear' : `Select all ${visible.length}`}
                            </span>
                        </label>
                    </div>

                    <ul className={styles.list}>
                        {visible.map(activity => {
                            const id = activity.strava_activity_id
                            const link = wingByFlight.get(id)
                            const colour =
                                link?.wing_colour ??
                                flightTrackColour(activity.pilot_id, link?.wing ?? null)
                            return (
                                <li key={id} className={styles.row} data-selected={selected.has(id) || undefined}>
                                    <input
                                        type="checkbox"
                                        className={styles.check}
                                        checked={selected.has(id)}
                                        onChange={() => toggle(id)}
                                        aria-label={`Select ${activity.name}`}
                                    />

                                    <TrackThumb
                                        polyline={activity.polyline}
                                        colour={colour}
                                        label={`Track of ${activity.name}`}
                                    />

                                    <div className={styles.body}>
                                        <div className={styles.title}>
                                            {tab === 'flight' ? (
                                                <Link href={`/flights/${id}`} className={styles.titleLink}>
                                                    {activity.name}
                                                </Link>
                                            ) : (
                                                activity.name
                                            )}
                                        </div>
                                        <div className={styles.meta}>
                                            {new Date(activity.start_date).toLocaleDateString()}
                                            {' · '}
                                            {formatDuration(activity.elapsed_sec)}
                                            {activity.distance_meters > 0 &&
                                                ` · ${(activity.distance_meters / 1000).toFixed(1)} km`}
                                        </div>
                                        {/* Reasons, not a percentage. Two is enough to
                                            recognise your own flight by. */}
                                        <div className={styles.reasons}>
                                            {activity.reasons.slice(0, 2).map(reason => (
                                                <span
                                                    key={reason.code}
                                                    className={styles.reason}
                                                    data-against={reason.points < 0 || undefined}
                                                >
                                                    {reason.text}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.rowActions}>
                                        {tab === 'flight' && (
                                            <div className={styles.wingCell}>
                                                <button
                                                    type="button"
                                                    className={styles.wingChip}
                                                    data-unknown={!link?.wing_id || undefined}
                                                    onClick={() => setWingMenuFor(wingMenuFor === id ? null : id)}
                                                    disabled={isPending}
                                                >
                                                    <span
                                                        className={styles.wingDot}
                                                        style={link?.wing_colour ? { backgroundColor: link.wing_colour } : undefined}
                                                        aria-hidden="true"
                                                    />
                                                    {link?.wing ?? 'Which wing?'}
                                                </button>

                                                {wingMenuFor === id && (
                                                    <ul className={styles.wingMenu}>
                                                        {wings.map(wing => (
                                                            <li key={wing.wing_id}>
                                                                <button
                                                                    type="button"
                                                                    className={styles.wingOption}
                                                                    onClick={() =>
                                                                        run(() => setFlightWing([id], wing.wing_id))
                                                                    }
                                                                >
                                                                    <span
                                                                        className={styles.wingDot}
                                                                        style={{ backgroundColor: wing.colour }}
                                                                        aria-hidden="true"
                                                                    />
                                                                    {wing.name}
                                                                    {wing.retired && (
                                                                        <span className={styles.retired}>retired</span>
                                                                    )}
                                                                </button>
                                                            </li>
                                                        ))}
                                                        {wings.length === 0 && (
                                                            <li className={styles.wingOptionEmpty}>
                                                                <Link href="/dashboard">Add a wing first</Link>
                                                            </li>
                                                        )}
                                                        {link?.wing_id && (
                                                            <li>
                                                                <button
                                                                    type="button"
                                                                    className={styles.wingOption}
                                                                    onClick={() => run(() => setFlightWing([id], null))}
                                                                >
                                                                    Clear the wing
                                                                </button>
                                                            </li>
                                                        )}
                                                    </ul>
                                                )}
                                            </div>
                                        )}

                                        {tab !== 'flight' && (
                                            <button
                                                type="button"
                                                className={styles.yes}
                                                disabled={isPending}
                                                onClick={() =>
                                                    run(() => setActivityVerdict([id], 'flight'), {
                                                        undoIds: [id],
                                                        undoLabel: 'Undo',
                                                    })
                                                }
                                            >
                                                Flight
                                            </button>
                                        )}
                                        {tab !== 'not_flight' && (
                                            <button
                                                type="button"
                                                className={styles.no}
                                                disabled={isPending}
                                                onClick={() =>
                                                    run(() => setActivityVerdict([id], 'not_flight'), {
                                                        undoIds: [id],
                                                        undoLabel: 'Undo',
                                                    })
                                                }
                                            >
                                                Not a flight
                                            </button>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>

                    {tab === 'unsure' && visible.length > 1 && selectedIds.length === 0 && (
                        <div className={styles.bulkHint}>
                            <button
                                type="button"
                                className={styles.linkish}
                                disabled={isPending}
                                onClick={() => {
                                    const ids = visible.map(a => a.strava_activity_id)
                                    run(() => setActivityVerdict(ids, 'flight'), { undoIds: ids })
                                }}
                            >
                                Accept all {visible.length}
                            </button>
                            <span aria-hidden="true"> · </span>
                            <button
                                type="button"
                                className={styles.linkish}
                                disabled={isPending}
                                onClick={() => {
                                    const ids = visible.map(a => a.strava_activity_id)
                                    run(() => setActivityVerdict(ids, 'not_flight'), { undoIds: ids })
                                }}
                            >
                                Reject all
                            </button>
                        </div>
                    )}
                </>
            )}

            {selectedIds.length > 0 && (
                <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
                    <strong>{selectedIds.length} selected</strong>
                    {tab !== 'flight' && (
                        <button
                            type="button"
                            className={styles.bulkAction}
                            disabled={isPending}
                            onClick={() =>
                                run(() => setActivityVerdict(selectedIds, 'flight'), { undoIds: selectedIds })
                            }
                        >
                            Mark as flights
                        </button>
                    )}
                    {tab !== 'not_flight' && (
                        <button
                            type="button"
                            className={styles.bulkAction}
                            disabled={isPending}
                            onClick={() =>
                                run(() => setActivityVerdict(selectedIds, 'not_flight'), { undoIds: selectedIds })
                            }
                        >
                            Not flights
                        </button>
                    )}
                    {tab === 'flight' && wings.length > 0 && (
                        <select
                            className={styles.bulkSelect}
                            aria-label="Set wing on selected flights"
                            defaultValue=""
                            disabled={isPending}
                            onChange={event => {
                                if (!event.target.value) return
                                run(() => setFlightWing(selectedIds, event.target.value))
                            }}
                        >
                            <option value="">Set wing…</option>
                            {wings.map(wing => (
                                <option key={wing.wing_id} value={wing.wing_id}>{wing.name}</option>
                            ))}
                        </select>
                    )}
                    <button type="button" className={styles.bulkClear} onClick={() => setSelected(new Set())}>
                        Clear
                    </button>
                </div>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}

            {notice && !error && (
                <p className={styles.toast} role="status">
                    {notice}
                    {undo && (
                        <button
                            type="button"
                            className={styles.undo}
                            disabled={isPending}
                            onClick={() => run(() => setActivityVerdict(undo.ids, null))}
                        >
                            {undo.label}
                        </button>
                    )}
                </p>
            )}
        </div>
    )
}
