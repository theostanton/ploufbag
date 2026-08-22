'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setActivityVerdict, setFlightWing } from '@actions/activities'
import { GENERIC_ACTION_ERROR, type ActionResult } from '@model/ActionResult'
import type { PanelWing } from './ActivitiesPanel'
import styles from './FlightControls.module.css'

/**
 * The two corrections, on the flight itself.
 *
 * Almost nobody notices a wrong wing on a settings screen; they notice it while
 * looking at the flight. So the same two actions the triage list offers are here
 * too, on the thing being looked at, rather than requiring a trip to a list to
 * fix what is already on screen.
 *
 * Only rendered for the pilot who flew it.
 */
export default function FlightControls({
    flightId,
    wingId,
    wingName,
    wingColour,
    wings,
}: {
    flightId: string
    wingId: string | null
    wingName: string | null
    wingColour: string | null
    wings: PanelWing[]
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    function run(action: () => Promise<ActionResult>, options: { thenGo?: string } = {}) {
        setError(null)
        startTransition(async () => {
            const result = await action()
            if (!result.ok) {
                setError(result.error ?? GENERIC_ACTION_ERROR)
                return
            }
            setNotice(result.message ?? null)
            setOpen(false)
            setConfirming(false)
            if (options.thenGo) {
                router.push(options.thenGo)
            } else {
                router.refresh()
            }
        })
    }

    return (
        <div className={styles.controls}>
            <div className={styles.wingCell}>
                <button
                    type="button"
                    className={styles.chip}
                    data-unknown={!wingId || undefined}
                    disabled={isPending}
                    onClick={() => setOpen(!open)}
                >
                    <span
                        className={styles.dot}
                        style={wingColour ? { backgroundColor: wingColour } : undefined}
                        aria-hidden="true"
                    />
                    {wingName ?? 'Which wing?'}
                </button>

                {open && (
                    <ul className={styles.menu}>
                        {wings.map(wing => (
                            <li key={wing.wing_id}>
                                <button
                                    type="button"
                                    className={styles.option}
                                    onClick={() => run(() => setFlightWing([flightId], wing.wing_id))}
                                >
                                    <span
                                        className={styles.dot}
                                        style={{ backgroundColor: wing.colour }}
                                        aria-hidden="true"
                                    />
                                    {wing.name}
                                </button>
                            </li>
                        ))}
                        {wingId && (
                            <li>
                                <button
                                    type="button"
                                    className={styles.option}
                                    onClick={() => run(() => setFlightWing([flightId], null))}
                                >
                                    Clear the wing
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </div>

            {confirming ? (
                <span className={styles.confirm}>
                    {/* The side effect is stated before the button, not discovered
                        afterwards: we edited their Strava activity, and undoing
                        that is part of this. */}
                    <span className={styles.confirmText}>
                        This drops the flight and takes our stats back off the Strava activity.
                    </span>
                    <button
                        type="button"
                        className={styles.danger}
                        disabled={isPending}
                        onClick={() =>
                            run(() => setActivityVerdict([flightId], 'not_flight'), { thenGo: '/activities' })
                        }
                    >
                        Not a flight
                    </button>
                    <button type="button" className={styles.quiet} onClick={() => setConfirming(false)}>
                        Keep it
                    </button>
                </span>
            ) : (
                <button
                    type="button"
                    className={styles.quiet}
                    disabled={isPending}
                    onClick={() => setConfirming(true)}
                >
                    Not a flight
                </button>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}
            {notice && !error && <p className={styles.notice} role="status">{notice}</p>}
        </div>
    )
}
