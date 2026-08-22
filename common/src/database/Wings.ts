import { Either, failure, success, StravaAthleteId, Wing, WingId } from '../model';
import { withPooledClient, Client } from '../database';

/** A wing plus how many flights are attributed to it. */
export type WingWithCount = Wing & { flights: number }

/** The editable fields of a wing. Dates are calendar dates, `YYYY-MM-DD`. */
export type WingInput = {
    name: string
    manufacturer?: string | null
    model?: string | null
    colour: string
    flown_from?: string | null
    flown_until?: string | null
    retired?: boolean
}

/**
 * A pilot's gliders.
 *
 * Every mutation takes the pilot id and scopes its `where` by it, rather than
 * trusting the wing id alone. Wing ids reach the server from the browser, so a
 * query keyed only on the id would let anyone who guessed one rename or delete
 * somebody else's wing. The pilot id comes from the session and cannot be
 * forged, so it is the one that decides.
 *
 * `flights.wing` is kept in step with `wings.name` on every write. The text
 * column is what DescriptionFormatter publishes to Strava and what the per-wing
 * pages route on, so a rename that updated only the wing row would leave both
 * showing the old name until something else rewrote them.
 */
/*
 * A note on the `::text::` casts below, which look redundant and are not.
 *
 * ts-postgres infers a parameter's wire type from the cast written next to it.
 * Given `$6::date` it decides the parameter *is* a date, then fails to encode a
 * JavaScript string into one -- and rather than erroring it sends null, so the
 * value silently vanishes and a date filter matches every row. Casting from text
 * instead types the parameter as text, which it encodes correctly, and Postgres
 * does the conversion.
 *
 * Found by running the suite against a real database for the first time: three
 * tests failed because `assignToDateRange` had received null for both ends of
 * the period and cheerfully reassigned the pilot's entire history.
 */
export namespace Wings {

    /**
     * Dates come back through `to_char` rather than as timestamps -- see the
     * note on Wing.flown_from for why a calendar date must not become an
     * instant.
     */
    const COLUMNS = `
        wing_id,
        pilot_id,
        name,
        manufacturer,
        model,
        colour,
        to_char(flown_from, 'YYYY-MM-DD')  as flown_from,
        to_char(flown_until, 'YYYY-MM-DD') as flown_until,
        retired,
        sort
    `

    /**
     * `sort` first so a pilot can order their own list, then most recently
     * flown, then name -- the last two so a pilot who has never touched the
     * order still gets something stable rather than insertion order.
     *
     * Retired wings are included. They are still the correct attribution for
     * every flight already flown on them, so a caller wanting only current
     * gliders filters, rather than this hiding history.
     */
    const ORDER = `order by sort, flown_from desc nulls last, lower(name)`

    export async function getForPilot(pilotId: StravaAthleteId): Promise<Either<Wing[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<Wing>(
                    `select ${COLUMNS} from wings where pilot_id = $1::integer ${ORDER}`,
                    [pilotId]
                )
                // An empty list is a real answer -- a pilot who has connected but
                // not set up a wing yet -- so this is a success, not a failure.
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Wings.getForPilot failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    /** The list the management screen renders: wings with their flight counts. */
    export async function getForPilotWithCounts(pilotId: StravaAthleteId): Promise<Either<WingWithCount[]>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<WingWithCount>(
                    `select ${COLUMNS},
                            (select count(1)::int from flights f where f.wing_id = w.wing_id) as flights
                     from wings w
                     where pilot_id = $1::integer ${ORDER}`,
                    [pilotId]
                )
                return success(result.rows.map(row => row.reify()))
            } catch (error) {
                return failure(`Wings.getForPilotWithCounts failed for pilotId=${pilotId}: ${error}`)
            }
        });
    }

    export async function get(pilotId: StravaAthleteId, wingId: WingId): Promise<Either<Wing>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<Wing>(
                    `select ${COLUMNS} from wings where wing_id = $1::uuid and pilot_id = $2::integer`,
                    [wingId, pilotId]
                )
                if (result.rows.length !== 1) {
                    return failure(`No wing for wingId=${wingId}`)
                }
                return success(result.rows[0].reify())
            } catch (error) {
                return failure(`Wings.get failed for wingId=${wingId}: ${error}`)
            }
        });
    }

    export async function create(pilotId: StravaAthleteId, input: WingInput): Promise<Either<Wing>> {
        return withPooledClient(async (database: Client) => {
            try {
                const result = await database.query<Wing>(
                    `insert into wings (pilot_id, name, manufacturer, model, colour, flown_from, flown_until, retired)
                     values ($1::integer, $2, $3, $4, $5, $6::text::date, $7::text::date, $8)
                     returning ${COLUMNS}`,
                    [
                        pilotId,
                        input.name.trim(),
                        input.manufacturer ?? null,
                        input.model ?? null,
                        input.colour,
                        input.flown_from || null,
                        input.flown_until || null,
                        input.retired ?? false,
                    ]
                )
                return success(result.rows[0].reify())
            } catch (error) {
                // wings_pilot_name_key. Worth naming, because "you already have
                // a wing called that" is a thing the pilot can act on and
                // "duplicate key value violates unique constraint" is not.
                if (`${error}`.includes('wings_pilot_name_key')) {
                    return failure(`You already have a wing called ${input.name.trim()}`)
                }
                return failure(`Wings.create failed: ${error}`)
            }
        });
    }

    export async function update(
        pilotId: StravaAthleteId,
        wingId: WingId,
        input: WingInput
    ): Promise<Either<Wing>> {
        return withPooledClient(async (database: Client) => {
            try {
                const name = input.name.trim()
                const result = await database.query<Wing>(
                    `update wings
                     set name         = $3,
                         manufacturer = $4,
                         model        = $5,
                         colour       = $6,
                         flown_from   = $7::text::date,
                         flown_until  = $8::text::date,
                         retired      = $9
                     where wing_id = $1::uuid
                       and pilot_id = $2::integer
                     returning ${COLUMNS}`,
                    [
                        wingId,
                        pilotId,
                        name,
                        input.manufacturer ?? null,
                        input.model ?? null,
                        input.colour,
                        input.flown_from || null,
                        input.flown_until || null,
                        input.retired ?? false,
                    ]
                )
                if (result.rows.length !== 1) {
                    return failure(`No wing for wingId=${wingId}`)
                }

                // Keep the text column in step, or a rename shows up on the
                // dashboard and nowhere else until the next description write.
                await database.query(
                    `update flights set wing = $2 where wing_id = $1::uuid`,
                    [wingId, name]
                )

                return success(result.rows[0].reify())
            } catch (error) {
                if (`${error}`.includes('wings_pilot_name_key')) {
                    return failure(`You already have a wing called ${input.name.trim()}`)
                }
                return failure(`Wings.update failed for wingId=${wingId}: ${error}`)
            }
        });
    }

    /**
     * Deletes a wing. Its flights survive, unattributed.
     *
     * The foreign key is `on delete set null`, so the flights themselves are
     * untouched -- but `flights.wing` is a plain text column that no constraint
     * clears, so it is cleared here. Leaving it would produce a flight with no
     * wing_id still claiming a wing by name, which is the inconsistent state the
     * wings table exists to end.
     */
    export async function remove(pilotId: StravaAthleteId, wingId: WingId): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                const owned = await database.query<{ wing_id: WingId }>(
                    `select wing_id from wings where wing_id = $1::uuid and pilot_id = $2::integer`,
                    [wingId, pilotId]
                )
                if (owned.rows.length !== 1) {
                    return failure(`No wing for wingId=${wingId}`)
                }

                const affected = await database.query<{ n: number }>(
                    `select count(1)::int as n from flights where wing_id = $1::uuid`,
                    [wingId]
                )
                const unattributed = affected.rows[0].reify().n

                await database.query(
                    `update flights set wing = null where wing_id = $1::uuid`,
                    [wingId]
                )
                await database.query(
                    `delete from wings where wing_id = $1::uuid and pilot_id = $2::integer`,
                    [wingId, pilotId]
                )

                return success(unattributed)
            } catch (error) {
                return failure(`Wings.remove failed for wingId=${wingId}: ${error}`)
            }
        });
    }

    /**
     * Moves every flight from one wing onto another, then deletes the source.
     *
     * This is the repair for the free-text era: a pilot who finds "Zeno 2" and
     * "Zeno II" as two gliders merges them and keeps one. It is deliberately
     * one-directional and destructive of the source row only -- the flights are
     * never touched beyond their attribution.
     */
    export async function merge(
        pilotId: StravaAthleteId,
        sourceId: WingId,
        targetId: WingId
    ): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                if (sourceId === targetId) {
                    return failure('A wing cannot be merged into itself')
                }

                const wings = await database.query<Wing>(
                    `select ${COLUMNS} from wings
                     where wing_id in ($1::uuid, $2::uuid) and pilot_id = $3::integer`,
                    [sourceId, targetId, pilotId]
                )
                // Both must belong to this pilot. Checking the count is what
                // stops a merge across two accounts.
                if (wings.rows.length !== 2) {
                    return failure('Both wings must be yours')
                }
                const target = wings.rows
                    .map(row => row.reify())
                    .find(wing => wing.wing_id === targetId)!

                const moved = await database.query<{ n: number }>(
                    `select count(1)::int as n from flights where wing_id = $1::uuid`,
                    [sourceId]
                )

                await database.query(
                    `update flights set wing_id = $2::uuid, wing = $3 where wing_id = $1::uuid`,
                    [sourceId, targetId, target.name]
                )
                await database.query(
                    `delete from wings where wing_id = $1::uuid and pilot_id = $2::integer`,
                    [sourceId, pilotId]
                )

                return success(moved.rows[0].reify().n)
            } catch (error) {
                return failure(`Wings.merge failed: ${error}`)
            }
        });
    }

    /**
     * Which wing a flight on this date was most likely flown on.
     *
     * Rules two and three of the design's wing resolution, in order: a pilot who
     * flies one wing gets that wing; otherwise, a date falling inside exactly
     * one wing's period gets that wing. Ambiguity resolves to nothing, and
     * nothing is a legal answer -- an unattributed flight is a flight, where
     * before it was a flight thrown away.
     *
     * Retired wings still count for dates inside their period. They are the
     * correct attribution for everything flown on them; "retired" means "stop
     * offering it for new flights", not "pretend it never flew".
     */
    export async function resolveForDate(
        pilotId: StravaAthleteId,
        date: Date
    ): Promise<Either<Wing | null>> {
        return withPooledClient(async (database: Client) => {
            try {
                const active = await database.query<Wing>(
                    `select ${COLUMNS} from wings where pilot_id = $1::integer and retired = false`,
                    [pilotId]
                )
                const activeWings = active.rows.map(row => row.reify())
                if (activeWings.length === 1) {
                    return success(activeWings[0])
                }

                // `< flown_until + 1 day` for the same reason assignToDateRange
                // uses it: the pilot means the whole of the closing day.
                const inPeriod = await database.query<Wing>(
                    `select ${COLUMNS} from wings
                     where pilot_id = $1::integer
                       and (flown_from is null or $2::timestamptz >= flown_from)
                       and (flown_until is null or $2::timestamptz < (flown_until + interval '1 day'))`,
                    [pilotId, date]
                )
                const candidates = inPeriod.rows.map(row => row.reify())
                if (candidates.length === 1) {
                    return success(candidates[0])
                }

                // Two wings flown concurrently, or none recorded for that date.
                // Both are ordinary, and both mean we do not know.
                return success(null)
            } catch (error) {
                return failure(`Wings.resolveForDate failed: ${error}`)
            }
        });
    }

    /**
     * Attributes every one of a pilot's flights in a date window to a wing.
     *
     * The bulk primitive the whole design rests on: two dates settle years of
     * flying, rather than a dropdown per flight. `from` and `until` are calendar
     * dates and inclusive of the whole of both days.
     *
     * @param onlyUnattributed when true, flights that already have a wing are
     *        left alone. That is the safe default for onboarding, where the
     *        pilot is filling in blanks rather than overruling themselves.
     */
    export async function assignToDateRange(
        pilotId: StravaAthleteId,
        wingId: WingId,
        from: string | null,
        until: string | null,
        onlyUnattributed: boolean = false
    ): Promise<Either<number>> {
        return withPooledClient(async (database: Client) => {
            try {
                const wing = await database.query<Wing>(
                    `select ${COLUMNS} from wings where wing_id = $1::uuid and pilot_id = $2::integer`,
                    [wingId, pilotId]
                )
                if (wing.rows.length !== 1) {
                    return failure(`No wing for wingId=${wingId}`)
                }
                const name = wing.rows[0].reify().name

                // `< until + 1 day` rather than `<= until`, because start_date
                // is a timestamp: a flight at 14:00 on the closing day is inside
                // the period the pilot described, and `<= '2022-03-01'` would
                // compare it against midnight and exclude it.
                const result = await database.query<{ strava_activity_id: string }>(
                    `update flights
                     set wing_id = $2::uuid, wing = $3
                     where pilot_id = $1::integer
                       and ($4::text::date is null or start_date >= $4::text::date)
                       and ($5::text::date is null or start_date < ($5::text::date + interval '1 day'))
                       and ($6::boolean is false or wing_id is null)
                     returning strava_activity_id`,
                    [pilotId, wingId, name, from || null, until || null, onlyUnattributed]
                )

                return success(result.rows.length)
            } catch (error) {
                return failure(`Wings.assignToDateRange failed: ${error}`)
            }
        });
    }
}
