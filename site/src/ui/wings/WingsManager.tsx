'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TRACK_COLOURS } from '@ploufbag/common/dist/trackColours'
import { searchWingCatalogue, type WingSuggestion } from '@ploufbag/common/dist/wingCatalogue'
import {
    assignWingToRange,
    createWing,
    deleteWing,
    mergeWings,
    updateWing,
    type WingActionResult,
    type WingFormValues,
} from '@actions/wings'
import { GENERIC_ACTION_ERROR } from '@model/ActionResult'
import styles from './WingsManager.module.css'

export type ManagedWing = {
    wing_id: string
    name: string
    manufacturer: string | null
    model: string | null
    colour: string
    flown_from: string | null
    flown_until: string | null
    retired: boolean
    flights: number
}

/**
 * A pilot's gliders, editable.
 *
 * This replaces a read-only tally of wing names, which is all a pilot could see
 * of their own gear until wings became rows. The list is the same shape as that
 * tally on purpose -- a colour, a name, a count -- because in a 390px rail that
 * is what fits, and the editor opens beneath the row rather than in a dialog for
 * the same reason.
 *
 * All state is local and every action re-fetches through router.refresh(). There
 * is no optimistic update: these actions rewrite flight attribution in bulk, and
 * showing a pilot a result that has not happened yet is the wrong trade when the
 * operation is "move 82 flights onto another wing".
 */
export default function WingsManager({ wings }: { wings: ManagedWing[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [openId, setOpenId] = useState<string | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    function run(action: () => Promise<WingActionResult>) {
        setError(null)
        setNotice(null)
        startTransition(async () => {
            const result = await action()
            if (result.ok) {
                setNotice(result.message ?? null)
                setOpenId(null)
                setIsAdding(false)
                router.refresh()
            } else {
                setError(result.error ?? GENERIC_ACTION_ERROR)
            }
        })
    }

    return (
        <div className={styles.manager}>
            {wings.length === 0 && !isAdding && (
                <p className={styles.empty}>
                    No wings yet. Add the glider you fly and every flight on it gets its own
                    colour on the map.
                </p>
            )}

            <ul className={styles.list}>
                {wings.map(wing => (
                    <li key={wing.wing_id} className={styles.item}>
                        <button
                            type="button"
                            className={styles.row}
                            onClick={() => setOpenId(openId === wing.wing_id ? null : wing.wing_id)}
                            aria-expanded={openId === wing.wing_id}
                        >
                            <span
                                className={styles.dot}
                                style={{ backgroundColor: wing.colour }}
                                aria-hidden="true"
                            />
                            <span className={styles.name}>
                                {wing.name}
                                {wing.retired && <span className={styles.retired}>retired</span>}
                            </span>
                            <span className={styles.count}>
                                {wing.flights}
                            </span>
                            <span className={styles.chevron} aria-hidden="true">
                                {openId === wing.wing_id ? '⌃' : '⌄'}
                            </span>
                        </button>

                        {openId === wing.wing_id && (
                            <WingEditor
                                wing={wing}
                                others={wings.filter(other => other.wing_id !== wing.wing_id)}
                                busy={isPending}
                                onSave={values => run(() => updateWing(wing.wing_id, values))}
                                onDelete={() => run(() => deleteWing(wing.wing_id))}
                                onMerge={targetId => run(() => mergeWings(wing.wing_id, targetId))}
                                onAssign={(from, until) =>
                                    run(() => assignWingToRange(wing.wing_id, from, until, false))
                                }
                                onCancel={() => setOpenId(null)}
                            />
                        )}
                    </li>
                ))}
            </ul>

            {isAdding ? (
                <div className={styles.item}>
                    <WingEditor
                        wing={null}
                        others={[]}
                        busy={isPending}
                        onSave={values => run(() => createWing(values))}
                        onCancel={() => setIsAdding(false)}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    className={styles.add}
                    onClick={() => {
                        setIsAdding(true)
                        setOpenId(null)
                    }}
                >
                    Add a wing
                </button>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}
            {notice && <p className={styles.notice} role="status">{notice}</p>}
        </div>
    )
}

/** The next colour nobody is using, so a new wing is not born a duplicate. */
function suggestColour(taken: string[]): string {
    return TRACK_COLOURS.find(colour => !taken.includes(colour)) ?? TRACK_COLOURS[0]
}

function WingEditor({
    wing,
    others,
    busy,
    onSave,
    onDelete,
    onMerge,
    onAssign,
    onCancel,
}: {
    wing: ManagedWing | null
    others: ManagedWing[]
    busy: boolean
    onSave: (values: WingFormValues) => void
    onDelete?: () => void
    onMerge?: (targetId: string) => void
    onAssign?: (from: string | null, until: string | null) => void
    onCancel: () => void
}) {
    const [name, setName] = useState(wing?.name ?? '')
    const [manufacturer, setManufacturer] = useState(wing?.manufacturer ?? null)
    const [model, setModel] = useState(wing?.model ?? null)
    const [colour, setColour] = useState(wing?.colour ?? suggestColour(others.map(o => o.colour)))
    const [flownFrom, setFlownFrom] = useState(wing?.flown_from ?? '')
    const [flownUntil, setFlownUntil] = useState(wing?.flown_until ?? '')
    const [retired, setRetired] = useState(wing?.retired ?? false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [mergeTarget, setMergeTarget] = useState('')

    // Suppressed once a suggestion is taken, so picking one does not leave the
    // list open underneath the field it just filled in.
    const [showSuggestions, setShowSuggestions] = useState(false)
    const suggestions = useMemo(
        () => (showSuggestions ? searchWingCatalogue(name) : []),
        [name, showSuggestions]
    )

    function choose(suggestion: WingSuggestion) {
        setName(suggestion.name)
        setManufacturer(suggestion.manufacturer)
        setModel(suggestion.model)
        setShowSuggestions(false)
    }

    const values: WingFormValues = {
        name,
        manufacturer,
        model,
        colour,
        flown_from: flownFrom || null,
        flown_until: flownUntil || null,
        retired,
    }

    return (
        <div className={styles.editor}>
            <label className={styles.field}>
                <span className={styles.label}>Wing</span>
                <input
                    className={styles.input}
                    value={name}
                    placeholder="Start typing — Ozone, Advance, Nova…"
                    onChange={event => {
                        setName(event.target.value)
                        setShowSuggestions(true)
                    }}
                    autoFocus={!wing}
                />
            </label>

            {suggestions.length > 0 && (
                <ul className={styles.suggestions}>
                    {suggestions.map(suggestion => (
                        <li key={suggestion.name}>
                            <button
                                type="button"
                                className={styles.suggestion}
                                onClick={() => choose(suggestion)}
                            >
                                <span className={styles.suggestionName}>{suggestion.model}</span>
                                <span className={styles.suggestionMake}>{suggestion.manufacturer}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className={styles.field}>
                <span className={styles.label}>Colour on the map</span>
                <div className={styles.swatches} role="radiogroup" aria-label="Colour on the map">
                    {TRACK_COLOURS.map(option => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={colour === option}
                            aria-label={option}
                            className={styles.swatch}
                            data-selected={colour === option || undefined}
                            style={{ backgroundColor: option }}
                            onClick={() => setColour(option)}
                        />
                    ))}
                </div>
            </div>

            <div className={styles.field}>
                <span className={styles.label}>Flown</span>
                <div className={styles.dates}>
                    <input
                        type="date"
                        className={styles.date}
                        value={flownFrom}
                        aria-label="Flown from"
                        onChange={event => setFlownFrom(event.target.value)}
                    />
                    <span className={styles.to}>to</span>
                    <input
                        type="date"
                        className={styles.date}
                        value={flownUntil}
                        aria-label="Flown until"
                        placeholder="still flying"
                        onChange={event => setFlownUntil(event.target.value)}
                    />
                </div>
                <p className={styles.hint}>
                    Leave the end empty if you are still flying it. These dates are what let us
                    work out the wing on a flight that does not say.
                </p>
            </div>

            <label className={styles.checkbox}>
                <input
                    type="checkbox"
                    checked={retired}
                    onChange={event => setRetired(event.target.checked)}
                />
                <span>Retired — keep its flights, stop suggesting it</span>
            </label>

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => onSave(values)}
                >
                    {wing ? 'Save' : 'Add wing'}
                </button>
                <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>

            {wing && onAssign && (
                <div className={styles.tool}>
                    <p className={styles.toolText}>
                        Set every flight between those dates to this wing.
                    </p>
                    <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || (!flownFrom && !flownUntil)}
                        onClick={() => onAssign(flownFrom || null, flownUntil || null)}
                    >
                        Apply to my flights
                    </button>
                </div>
            )}

            {wing && onMerge && others.length > 0 && (
                <div className={styles.tool}>
                    <p className={styles.toolText}>
                        Same glider under two names? Move this one’s {wing.flights} flight
                        {wing.flights === 1 ? '' : 's'} across and delete it.
                    </p>
                    <div className={styles.mergeRow}>
                        <select
                            className={styles.select}
                            value={mergeTarget}
                            aria-label="Merge into"
                            onChange={event => setMergeTarget(event.target.value)}
                        >
                            <option value="">Merge into…</option>
                            {others.map(other => (
                                <option key={other.wing_id} value={other.wing_id}>
                                    {other.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className={styles.secondary}
                            disabled={busy || !mergeTarget}
                            onClick={() => onMerge(mergeTarget)}
                        >
                            Merge
                        </button>
                    </div>
                </div>
            )}

            {wing && onDelete && (
                <div className={styles.tool}>
                    {confirmingDelete ? (
                        <>
                            <p className={styles.toolText}>
                                {wing.flights === 0
                                    ? 'Delete this wing?'
                                    : `Its ${wing.flights} flight${wing.flights === 1 ? '' : 's'} stay, with no wing on them.`}
                            </p>
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={busy}
                                    onClick={onDelete}
                                >
                                    Delete anyway
                                </button>
                                <button
                                    type="button"
                                    className={styles.secondary}
                                    onClick={() => setConfirmingDelete(false)}
                                >
                                    Keep it
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            className={styles.quiet}
                            onClick={() => setConfirmingDelete(true)}
                        >
                            Delete this wing
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
