/**
 * What a server action hands back to the component that called it.
 *
 * Deliberately one shape with optional fields rather than the discriminated
 * union this obviously wants to be:
 *
 *     { ok: true; message?: string } | { ok: false; error: string }
 *
 * The site compiles with `strict: false`, and with `strictNullChecks` off
 * TypeScript does not narrow a boolean-literal discriminant in the negative
 * branch -- `if (result.ok) {} else { result.error }` fails to compile with
 * "Property 'error' does not exist". So the union reads better and does not
 * build. If the site ever moves to strict mode, this is worth revisiting; until
 * then, please do not "fix" it back.
 *
 * Actions return failures as values rather than throwing them. These run behind
 * buttons inside a panel, and the useful response to "you already have a wing
 * called that" is a message beside the field, not an error boundary.
 */
export type ActionResult = {
    ok: boolean
    /** Set when it worked, and worth telling the pilot about. */
    message?: string
    /** Set when it did not. Written for the pilot, not for a log. */
    error?: string
}

export function actionOk(message?: string): ActionResult {
    return { ok: true, message }
}

export function actionError(error: string): ActionResult {
    return { ok: false, error }
}

/** What to show when an action failed without saying why. */
export const GENERIC_ACTION_ERROR = 'That did not work. Try again.'
