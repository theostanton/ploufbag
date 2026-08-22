'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TRACK_COLOURS, searchWingCatalogue } from '@ploufbag/common'
import { assignWingToRange, createWing } from '@actions/wings'
import { chooseFlightActivityTypes, getOnboardingState, type OnboardingState } from '@actions/onboarding'
import { GENERIC_ACTION_ERROR, type ActionResult } from '@model/ActionResult'
import styles from './Onboarding.module.css'

type Step = 'reveal' | 'wings' | 'periods'

function formatAirtime(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatYear(iso: string | null) {
    return iso ? new Date(iso).getFullYear() : null
}

/**
 * The first thing a pilot sees after connecting Strava.
 *
 * Payoff before paperwork. The old version of this page said "there is nothing
 * else to set up", which was not true -- a flight only existed if the pilot had
 * hand-typed a 🪂 line into the Strava description -- and it asked for nothing
 * because there was nothing it could do with an answer.
 *
 * This asks for two things, and only after showing what we already found. A
 * pilot with one wing is finished in two taps.
 *
 * Built for partial data throughout: the scan is queued when they connect and
 * lands a few seconds later, so this fills in underneath them rather than
 * blocking behind a spinner where the payoff should be.
 */
export default function Onboarding({ initial, firstName }: { initial: OnboardingState; firstName: string }) {
    const router = useRouter()
    const [state, setState] = useState(initial)
    const [step, setStep] = useState<Step>('reveal')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    // Poll only while there is nothing to show. Once the scan has landed the
    // page is static, and a page that keeps polling after it has an answer is
    // just a background tab burning somebody's battery.
    const waiting = state.scanned === 0
    useEffect(() => {
        if (!waiting) return
        const timer = setInterval(async () => {
            try {
                setState(await getOnboardingState())
            } catch {
                // A failed poll is not worth telling anyone about; the next one
                // is three seconds away.
            }
        }, 3000)
        return () => clearInterval(timer)
    }, [waiting])

    function run(action: () => Promise<ActionResult>, then?: () => void) {
        setError(null)
        startTransition(async () => {
            const result = await action()
            if (!result.ok) {
                setError(result.error ?? GENERIC_ACTION_ERROR)
                return
            }
            setState(await getOnboardingState())
            then?.()
            router.refresh()
        })
    }

    if (step === 'wings') {
        return (
            <WingsStep
                state={state}
                busy={isPending}
                error={error}
                onAdd={(name, manufacturer, model, colour, onDone) =>
                    run(() => createWing({
                        name,
                        manufacturer,
                        model,
                        colour,
                        flown_from: null,
                        flown_until: null,
                        retired: false,
                    }), onDone)
                }
                onBack={() => setStep('reveal')}
                onNext={() => {
                    if (state.wings.length >= 2) {
                        setStep('periods')
                    } else if (state.wings.length === 1) {
                        // One wing, one answer: every flight is on it. This is the
                        // whole two-tap path, and asking about dates here would be
                        // asking a question with only one possible answer.
                        run(
                            () => assignWingToRange(state.wings[0].wing_id, null, null, true),
                            () => router.push('/dashboard')
                        )
                    } else {
                        router.push('/dashboard')
                    }
                }}
            />
        )
    }

    if (step === 'periods') {
        return (
            <PeriodsStep
                state={state}
                busy={isPending}
                error={error}
                onApply={assignments => {
                    startTransition(async () => {
                        setError(null)
                        for (const assignment of assignments) {
                            const result = await assignWingToRange(
                                assignment.wingId,
                                assignment.from,
                                assignment.until,
                                true
                            )
                            if (!result.ok) {
                                setError(result.error ?? GENERIC_ACTION_ERROR)
                                return
                            }
                        }
                        router.push('/dashboard')
                    })
                }}
                onBack={() => setStep('wings')}
            />
        )
    }

    return (
        <RevealStep
            state={state}
            firstName={firstName}
            busy={isPending}
            error={error}
            onContinue={() => setStep('wings')}
            onChooseTypes={types => run(() => chooseFlightActivityTypes(types))}
        />
    )
}

/* ---------------------------------------------------------------- reveal -- */

function RevealStep({
    state,
    firstName,
    busy,
    error,
    onContinue,
    onChooseTypes,
}: {
    state: OnboardingState
    firstName: string
    busy: boolean
    error: string | null
    onContinue: () => void
    onChooseTypes: (types: string[]) => void
}) {
    const [picked, setPicked] = useState<string[]>([])

    if (state.scanned === 0) {
        return (
            <div className={styles.step}>
                <p className={styles.eyebrow}>Connected as {firstName}</p>
                <h2 className={styles.title}>Reading your Strava account…</h2>
                <p className={styles.lede}>
                    We are looking through your activities for flights. This usually takes a few
                    seconds — the page will fill in on its own.
                </p>
                <p className={styles.reassure}>Nothing on Strava has been changed. We have only read.</p>
            </div>
        )
    }

    // Nothing found. The failure that used to be permanent and unexplained: the
    // importer only ever looked at Workouts and Kitesurfs, so a pilot who logs
    // flights as anything else saw an empty account for ever.
    if (state.flights === 0 && state.unsure === 0) {
        return (
            <div className={styles.step}>
                <p className={styles.eyebrow}>Connected as {firstName}</p>
                <h2 className={styles.title}>We could not pick out any flights.</h2>
                <p className={styles.lede}>
                    We looked at {state.scanned.toLocaleString()} activities. Strava has no
                    paragliding type, so pilots log flights as whatever is closest — which is yours?
                </p>

                <ul className={styles.types}>
                    {state.types.map(entry => (
                        <li key={entry.type}>
                            <button
                                type="button"
                                className={styles.type}
                                data-selected={picked.includes(entry.type) || undefined}
                                onClick={() =>
                                    setPicked(
                                        picked.includes(entry.type)
                                            ? picked.filter(type => type !== entry.type)
                                            : [...picked, entry.type]
                                    )
                                }
                            >
                                <span>{entry.type}</span>
                                <span className={styles.typeCount}>{entry.activities}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {error && <p className={styles.error} role="alert">{error}</p>}

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.primary}
                        disabled={busy || picked.length === 0}
                        onClick={() => onChooseTypes(picked)}
                    >
                        Look again
                    </button>
                    <Link href="/activities" className={styles.secondary}>
                        Pick them out myself
                    </Link>
                </div>
            </div>
        )
    }

    const sinceYear = formatYear(state.firstFlight)

    return (
        <div className={styles.step}>
            <p className={styles.eyebrow}>Connected as {firstName}</p>
            <h2 className={styles.title}>We found your flying.</h2>

            <div className={styles.headline}>
                <span className={styles.big}>{state.flights.toLocaleString()}</span>
                <span className={styles.bigUnit}>
                    flights
                    {sinceYear && <><br/>since {sinceYear}</>}
                </span>
            </div>

            <dl className={styles.facts}>
                <div>
                    <dt>Airtime</dt>
                    <dd>{formatAirtime(state.airtimeSec)}</dd>
                </div>
                <div>
                    <dt>Sites</dt>
                    <dd>{state.sites}</dd>
                </div>
                <div>
                    <dt>Longest</dt>
                    <dd>{state.longestKm.toFixed(0)} km</dd>
                </div>
            </dl>

            <p className={styles.reassure}>
                {state.scanned.toLocaleString()} Strava activities read. Nothing on Strava has been
                changed yet.
            </p>

            <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={onContinue} disabled={busy}>
                    Set up my wings
                </button>
                <Link href="/dashboard" className={styles.secondary}>Not now</Link>
            </div>

            {state.unsure > 0 && (
                <p className={styles.aside}>
                    {state.unsure} more we weren’t sure about. They are waiting in{' '}
                    <Link href="/activities">your activities</Link> whenever you feel like it —
                    or never.
                </p>
            )}
        </div>
    )
}

/* ----------------------------------------------------------------- wings -- */

function WingsStep({
    state,
    busy,
    error,
    onAdd,
    onBack,
    onNext,
}: {
    state: OnboardingState
    busy: boolean
    error: string | null
    onAdd: (
        name: string,
        manufacturer: string | null,
        model: string | null,
        colour: string,
        onDone: () => void
    ) => void
    onBack: () => void
    onNext: () => void
}) {
    const [name, setName] = useState('')
    const [manufacturer, setManufacturer] = useState<string | null>(null)
    const [model, setModel] = useState<string | null>(null)
    const [showSuggestions, setShowSuggestions] = useState(false)

    const colour = TRACK_COLOURS.find(
        option => !state.wings.some(wing => wing.colour === option)
    ) ?? TRACK_COLOURS[0]

    const suggestions = useMemo(
        () => (showSuggestions ? searchWingCatalogue(name, 5) : []),
        [name, showSuggestions]
    )

    function reset() {
        setName('')
        setManufacturer(null)
        setModel(null)
        setShowSuggestions(false)
    }

    return (
        <div className={styles.step}>
            <p className={styles.eyebrow}>Step 1 of {state.wings.length >= 2 ? '2' : '2'}</p>
            <h2 className={styles.title}>Which wings have you flown?</h2>
            <p className={styles.lede}>
                The colour is how your tracks are drawn on the map. Add every glider you have
                flown, including ones you have sold.
            </p>

            {state.wings.length > 0 && (
                <ul className={styles.wingList}>
                    {state.wings.map(wing => (
                        <li key={wing.wing_id} className={styles.wingItem}>
                            <span className={styles.dot} style={{ backgroundColor: wing.colour }} aria-hidden="true"/>
                            {wing.name}
                        </li>
                    ))}
                </ul>
            )}

            <label className={styles.field}>
                <span className={styles.label}>Add a wing</span>
                <input
                    className={styles.input}
                    value={name}
                    autoFocus
                    placeholder="Start typing — Ozone, Advance, Nova…"
                    onChange={event => {
                        setName(event.target.value)
                        setShowSuggestions(true)
                    }}
                />
            </label>

            {suggestions.length > 0 && (
                <ul className={styles.suggestions}>
                    {suggestions.map(suggestion => (
                        <li key={suggestion.name}>
                            <button
                                type="button"
                                className={styles.suggestion}
                                onClick={() => {
                                    setName(suggestion.name)
                                    setManufacturer(suggestion.manufacturer)
                                    setModel(suggestion.model)
                                    setShowSuggestions(false)
                                }}
                            >
                                <span>{suggestion.model}</span>
                                <span className={styles.suggestionMake}>{suggestion.manufacturer}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy || name.trim().length === 0}
                    onClick={() => onAdd(name, manufacturer, model, colour, reset)}
                >
                    Add
                </button>
                <button
                    type="button"
                    className={styles.primary}
                    disabled={busy || state.wings.length === 0}
                    onClick={onNext}
                >
                    {state.wings.length >= 2 ? 'Next' : `Apply to all ${state.flights} flights`}
                </button>
            </div>

            <button type="button" className={styles.back} onClick={onBack} disabled={busy}>
                ← Back
            </button>
        </div>
    )
}

/* --------------------------------------------------------------- periods -- */

type Assignment = { wingId: string; from: string | null; until: string | null }

function PeriodsStep({
    state,
    busy,
    error,
    onApply,
    onBack,
}: {
    state: OnboardingState
    busy: boolean
    error: string | null
    onApply: (assignments: Assignment[]) => void
    onBack: () => void
}) {
    const [periods, setPeriods] = useState<Record<string, { from: string; until: string }>>(() =>
        Object.fromEntries(
            state.wings.map(wing => [
                wing.wing_id,
                { from: wing.flown_from ?? '', until: wing.flown_until ?? '' },
            ])
        )
    )

    // Which wing owns each month, so the strip shows the split being described
    // rather than describing it in words. This is what makes committing to a
    // bulk change over years of flying feel checkable.
    const months = state.monthly
    const maxFlights = Math.max(1, ...months.map(month => month.flights))

    function ownerOf(month: string): string | null {
        const start = `${month}-01`
        const owners = state.wings.filter(wing => {
            const period = periods[wing.wing_id]
            const from = period?.from || null
            const until = period?.until || null
            return (!from || start >= from.slice(0, 7) + '-01') &&
                (!until || start <= until)
        })
        return owners.length === 1 ? owners[0].wing_id : null
    }

    const colourOf = (wingId: string | null) =>
        state.wings.find(wing => wing.wing_id === wingId)?.colour ?? '#cfcfc6'

    const WIDTH = 340
    const HEIGHT = 54
    const step = months.length > 0 ? WIDTH / months.length : WIDTH
    const barWidth = Math.max(2, Math.min(8, step - 2))

    return (
        <div className={styles.step}>
            <p className={styles.eyebrow}>Step 2 of 2</p>
            <h2 className={styles.title}>When did you fly each?</h2>
            <p className={styles.lede}>
                Two dates settle every flight. The strip is your flying, month by month — it
                recolours as you type.
            </p>

            {months.length > 0 && (
                <svg
                    className={styles.strip}
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    role="img"
                    aria-label="Your flights by month, coloured by which wing's period covers them"
                >
                    {months.map((month, index) => {
                        const height = Math.max(2, (month.flights / maxFlights) * (HEIGHT - 14))
                        return (
                            <rect
                                key={month.month}
                                x={index * step}
                                y={HEIGHT - 12 - height}
                                width={barWidth}
                                height={height}
                                rx="1.5"
                                fill={colourOf(ownerOf(month.month))}
                            />
                        )
                    })}
                    <text x="0" y={HEIGHT - 1} className={styles.stripLabel}>
                        {months[0]?.month}
                    </text>
                    <text x={WIDTH} y={HEIGHT - 1} textAnchor="end" className={styles.stripLabel}>
                        {months[months.length - 1]?.month}
                    </text>
                </svg>
            )}

            <ul className={styles.periods}>
                {state.wings.map(wing => (
                    <li key={wing.wing_id} className={styles.period}>
                        <span className={styles.periodName}>
                            <span className={styles.dot} style={{ backgroundColor: wing.colour }} aria-hidden="true"/>
                            {wing.name}
                        </span>
                        <span className={styles.periodDates}>
                            <input
                                type="date"
                                className={styles.date}
                                aria-label={`${wing.name} flown from`}
                                value={periods[wing.wing_id]?.from ?? ''}
                                onChange={event =>
                                    setPeriods({
                                        ...periods,
                                        [wing.wing_id]: {
                                            ...periods[wing.wing_id],
                                            from: event.target.value,
                                        },
                                    })
                                }
                            />
                            <span className={styles.to}>to</span>
                            <input
                                type="date"
                                className={styles.date}
                                aria-label={`${wing.name} flown until`}
                                value={periods[wing.wing_id]?.until ?? ''}
                                onChange={event =>
                                    setPeriods({
                                        ...periods,
                                        [wing.wing_id]: {
                                            ...periods[wing.wing_id],
                                            until: event.target.value,
                                        },
                                    })
                                }
                            />
                        </span>
                    </li>
                ))}
            </ul>
            <p className={styles.hint}>Leave the end date empty for the wing you still fly.</p>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() =>
                        onApply(
                            state.wings.map(wing => ({
                                wingId: wing.wing_id,
                                from: periods[wing.wing_id]?.from || null,
                                until: periods[wing.wing_id]?.until || null,
                            }))
                        )
                    }
                >
                    Apply to {state.flights} flights
                </button>
                <Link href="/activities" className={styles.secondary}>Set them one by one</Link>
            </div>

            <button type="button" className={styles.back} onClick={onBack} disabled={busy}>
                ← Back
            </button>
        </div>
    )
}
