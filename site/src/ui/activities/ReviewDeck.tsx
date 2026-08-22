'use client'

import { useState } from 'react'
import { flightTrackColour, type ActivityRow } from '@ploufbag/common'
import TrackThumb from './TrackThumb'
import styles from './Activities.module.css'

/**
 * The unsure pile, one at a time.
 *
 * The list is wrong on a phone: it puts five undecidable rows on screen at once
 * and crushes the evidence that makes them decidable. A deck fits the medium,
 * and paragliding triage genuinely is a series of yes/no glances at a shape.
 *
 * Offered as a mode rather than switched on by viewport. Rendering both and
 * hiding one with a media query means building both and testing neither, and a
 * pilot on a laptop with forty maybes wants this too.
 *
 * Buttons, not swipe. A swipe-only deck fails keyboard and screen-reader users
 * and hides its own affordance; a gesture would be an accelerator on top of
 * these, never a replacement for them.
 */
export default function ReviewDeck({
    activities,
    busy,
    onDecide,
    onAcceptRest,
    onExit,
}: {
    activities: ActivityRow[]
    busy: boolean
    onDecide: (activityId: string, isFlight: boolean) => void
    onAcceptRest: (activityIds: string[]) => void
    onExit: () => void
}) {
    const [index, setIndex] = useState(0)

    const current = activities[index]
    if (!current) {
        return (
            <div className={styles.deckDone}>
                <p>That is all of them.</p>
                <button type="button" className={styles.linkish} onClick={onExit}>
                    Back to the list
                </button>
            </div>
        )
    }

    const remaining = activities.slice(index + 1)

    function decide(isFlight: boolean) {
        onDecide(current.strava_activity_id, isFlight)
        // Advance locally rather than waiting for the refetch. The decision is
        // already recorded; making someone watch a spinner between each of
        // seventeen taps is how a review queue becomes a chore.
        setIndex(index + 1)
    }

    return (
        <div className={styles.deck}>
            <p className={styles.deckProgress}>
                {index + 1} of {activities.length}
            </p>

            <div className={styles.deckCard}>
                <div className={styles.deckTrack}>
                    <TrackThumb
                        polyline={current.polyline}
                        colour={flightTrackColour(current.pilot_id, null)}
                        label={`Track of ${current.name}`}
                    />
                </div>

                <div className={styles.deckTitle}>{current.name}</div>
                <div className={styles.meta}>
                    {new Date(current.start_date).toLocaleDateString()}
                    {' · '}
                    {Math.round(current.elapsed_sec / 60)} min
                    {current.distance_meters > 0 &&
                        ` · ${(current.distance_meters / 1000).toFixed(1)} km`}
                </div>

                <div className={styles.reasons}>
                    {current.reasons.slice(0, 3).map(reason => (
                        <span
                            key={reason.code}
                            className={styles.reason}
                            data-against={reason.points < 0 || undefined}
                        >
                            {reason.text}
                        </span>
                    ))}
                </div>

                <div className={styles.deckActions}>
                    <button
                        type="button"
                        className={styles.no}
                        disabled={busy}
                        onClick={() => decide(false)}
                    >
                        Not a flight
                    </button>
                    <button
                        type="button"
                        className={styles.yes}
                        disabled={busy}
                        onClick={() => decide(true)}
                    >
                        Flight
                    </button>
                </div>
            </div>

            {/* The exit is always on screen. This pile can never become an
                obligation, and it is the least valuable work in the product. */}
            <div className={styles.deckFoot}>
                {remaining.length > 0 && (
                    <button
                        type="button"
                        className={styles.linkish}
                        disabled={busy}
                        onClick={() => onAcceptRest(remaining.map(a => a.strava_activity_id))}
                    >
                        Accept the remaining {remaining.length}
                    </button>
                )}
                <button type="button" className={styles.linkish} onClick={onExit}>
                    Back to the list
                </button>
            </div>
        </div>
    )
}
