'use server'

import { Auth } from "@auth/index";
import {
    TRACK_COLOURS,
    Wings,
    isSuccess,
    type WingInput,
} from "@ploufbag/common";
import { revalidatePath } from 'next/cache';
import { actionError, actionOk, type ActionResult } from "@model/ActionResult";

/**
 * Managing a pilot's gliders.
 *
 * Every action reads the pilot from the session rather than taking one, so a
 * crafted request can only ever act on its own wings. Wing ids are passed
 * through to the data layer, which scopes each statement by pilot id as well.
 *
 * Failures come back as values rather than thrown errors: these run behind
 * buttons in a panel, and the useful response to "you already have a wing
 * called that" is a message next to the field, not an error boundary.
 */

export type WingActionResult = ActionResult

export type WingFormValues = {
    name: string
    manufacturer: string | null
    model: string | null
    colour: string
    flown_from: string | null
    flown_until: string | null
    retired: boolean
}

/** `YYYY-MM-DD`, or nothing. Anything else is a bug or a forged request. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function cleanDate(value: string | null | undefined): string | null {
    if (!value) return null
    return DATE_PATTERN.test(value) ? value : null
}

/**
 * Rejects what the database would reject anyway, plus what it would happily
 * accept and shouldn't.
 *
 * The colour check is the one that matters. The palette was chosen so that a
 * track reads over satellite imagery in any season, and an arbitrary hex from a
 * crafted request could be white, or the exact green of summer forest. Limiting
 * it to the palette keeps every track legible.
 */
function validate(values: WingFormValues): string | null {
    const name = values.name?.trim() ?? ''
    if (name.length === 0) return 'Give the wing a name'
    if (name.length > 60) return 'That name is too long'

    if (!TRACK_COLOURS.includes(values.colour as typeof TRACK_COLOURS[number])) {
        return 'Pick one of the track colours'
    }

    const from = cleanDate(values.flown_from)
    const until = cleanDate(values.flown_until)
    if (from && until && from > until) {
        return 'The end date is before the start date'
    }

    return null
}

function toInput(values: WingFormValues): WingInput {
    return {
        name: values.name.trim(),
        manufacturer: values.manufacturer?.trim() || null,
        model: values.model?.trim() || null,
        colour: values.colour,
        flown_from: cleanDate(values.flown_from),
        flown_until: cleanDate(values.flown_until),
        retired: Boolean(values.retired),
    }
}

/**
 * Wing colours are baked into /api/geo/flights, which is cached for a minute.
 * Without busting it a pilot changes a colour, the panel updates, and the tracks
 * behind it keep their old hue until the cache expires -- which reads as the
 * change not having worked.
 */
function revalidateWingViews() {
    revalidatePath('/dashboard')
    revalidatePath('/api/geo/flights')
    revalidatePath('/flights')
}

export async function createWing(values: WingFormValues): Promise<WingActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    const invalid = validate(values)
    if (invalid) return actionError(invalid)

    const result = await Wings.create(pilotId, toInput(values))
    if (!isSuccess(result)) return actionError(result[1])

    revalidateWingViews()
    return actionOk(`Added ${result[0].name}`)
}

export async function updateWing(wingId: string, values: WingFormValues): Promise<WingActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    const invalid = validate(values)
    if (invalid) return actionError(invalid)

    const result = await Wings.update(pilotId, wingId, toInput(values))
    if (!isSuccess(result)) return actionError(result[1])

    revalidateWingViews()
    return actionOk(`Saved ${result[0].name}`)
}

/**
 * Deletes a wing. Its flights survive, unattributed -- which is the whole point
 * of the wing being nullable, and is stated in the confirmation the pilot sees
 * rather than discovered afterwards.
 */
export async function deleteWing(wingId: string): Promise<WingActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    const result = await Wings.remove(pilotId, wingId)
    if (!isSuccess(result)) return actionError(result[1])

    revalidateWingViews()
    const unattributed = result[0]
    return actionOk(
        unattributed === 0
            ? 'Wing deleted'
            : `Wing deleted. ${unattributed} flight${unattributed === 1 ? '' : 's'} now have no wing.`
    )
}

export async function mergeWings(sourceId: string, targetId: string): Promise<WingActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    const result = await Wings.merge(pilotId, sourceId, targetId)
    if (!isSuccess(result)) return actionError(result[1])

    revalidateWingViews()
    const moved = result[0]
    return actionOk(`Merged. ${moved} flight${moved === 1 ? '' : 's'} moved across.`)
}

/**
 * Attributes a stretch of the pilot's flying to one wing.
 *
 * The bulk primitive: two dates instead of a dropdown per flight. Used by the
 * wing editor's "apply to my flights" and, later, by onboarding.
 */
export async function assignWingToRange(
    wingId: string,
    from: string | null,
    until: string | null,
    onlyUnattributed: boolean = false
): Promise<WingActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    const result = await Wings.assignToDateRange(
        pilotId,
        wingId,
        cleanDate(from),
        cleanDate(until),
        onlyUnattributed
    )
    if (!isSuccess(result)) return actionError(result[1])

    revalidateWingViews()
    const assigned = result[0]
    return actionOk(
        assigned === 0
            ? 'No flights in that period'
            : `${assigned} flight${assigned === 1 ? '' : 's'} set to this wing`
    )
}
