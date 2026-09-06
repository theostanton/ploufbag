import { Pilots, withPooledClient } from '@ploufbag/common'
import { end } from '@/database/client'
import { StravaApi } from '@/stravaApi'
import { scanPilotActivities } from '@/tasks/scanActivities'
import { promotePilotFlights } from '@/tasks/promoteFlights'

/**
 * Re-read a pilot's Strava history, on demand, from outside the running system.
 *
 * The product had exactly one way to trigger this, and it was a side effect of
 * answering an onboarding question on /welcome -- so "my flights are missing"
 * had no remedy that did not involve pretending to sign up again. This is the
 * remedy: a operator command, dispatched from GitHub Actions, that says what it
 * did.
 *
 * It runs the same scanPilotActivities and promotePilotFlights the task service
 * runs. Nothing here is a second implementation of the import; if this and the
 * webhook ever disagree, that is a bug rather than a design.
 *
 * No Cloud Tasks queue is involved: the scan and the promotion both talk only to
 * Postgres and to Strava, which is what makes running them from a runner
 * possible at all.
 *
 * Usage:
 *   sync.ts                    # every pilot
 *   sync.ts --pilot 4142500    # one, repeatable
 *   sync.ts --dry-run          # scan and report; create no flights, write no
 *                              # descriptions to Strava
 */

type Options = {
    pilotIds: number[]
    dryRun: boolean
}

function parseArguments(argv: string[]): Options {
    const pilotIds: number[] = []
    let dryRun = false

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index]
        if (argument === '--dry-run') {
            dryRun = true
            continue
        }
        if (argument === '--pilot') {
            const value = argv[++index]
            for (const part of (value ?? '').split(',')) {
                const parsed = Number(part.trim())
                if (!Number.isInteger(parsed)) {
                    throw new Error(`--pilot wants a Strava athlete id, got "${part}"`)
                }
                pilotIds.push(parsed)
            }
            continue
        }
        throw new Error(`Unrecognised argument "${argument}"`)
    }
    return { pilotIds, dryRun }
}

/** Every pilot we hold, when none was named. */
async function allPilotIds(): Promise<number[]> {
    return withPooledClient(async database => {
        const result = await database.query<{ pilot_id: number }>(
            'select pilot_id from pilots order by pilot_id'
        )
        return result.rows.map(row => row.reify().pilot_id)
    })
}

async function syncPilot(pilotId: number, dryRun: boolean): Promise<boolean> {
    const [pilot, pilotError] = await Pilots.get(pilotId)
    if (pilotError || !pilot) {
        console.log(`  ${pilotId}  no such pilot: ${pilotError}`)
        return false
    }

    let api: StravaApi
    try {
        api = await StravaApi.fromUserId(pilotId)
    } catch (error) {
        // A pilot who revoked access is a fact about them, not a failure of the
        // run: the rest of the list still deserves to be synced.
        console.log(`  ${pilotId}  ${pilot.first_name}: no usable Strava token (${error})`)
        return false
    }

    const scan = await scanPilotActivities(pilotId, api)
    if (scan.error) {
        console.log(`  ${pilotId}  ${pilot.first_name}: scan failed: ${scan.error}`)
        return false
    }

    const counts = scan.summary!
    console.log(
        `  ${pilotId}  ${pilot.first_name}: scanned ${counts.scanned}, ` +
        `${counts.flight} flights, ${counts.unsure} unsure, ${counts.not_flight} not flights` +
        (counts.reviewed > 0 ? `, reviewed ${counts.reviewed} (${counts.reconsidered} changed)` : '')
    )

    if (dryRun) {
        console.log(`  ${pilotId}  ${pilot.first_name}: dry run, nothing promoted`)
        return true
    }

    const promotion = await promotePilotFlights(pilotId, api)
    if (promotion.error) {
        console.log(`  ${pilotId}  ${pilot.first_name}: promotion failed: ${promotion.error}`)
        return false
    }

    const summary = promotion.summary!
    console.log(
        `  ${pilotId}  ${pilot.first_name}: +${summary.promoted} flights, -${summary.demoted}` +
        (summary.remaining > 0 ? `, ${summary.remaining} still to do` : '') +
        (summary.rateLimited ? ' (paused on Strava rate limit -- run again in 15 minutes)' : '')
    )
    return true
}

async function main() {
    const options = parseArguments(process.argv.slice(2))

    for (const required of ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER']) {
        if (!process.env[required]) {
            throw new Error(`${required} is not set`)
        }
    }
    // Token refresh needs these, and a missing one surfaces as an unhelpful
    // Strava 400 several layers down.
    for (const required of ['CLIENT_ID', 'CLIENT_SECRET']) {
        if (!process.env[required]) {
            throw new Error(`${required} is not set; Strava tokens cannot be refreshed without it`)
        }
    }

    const pilotIds = options.pilotIds.length > 0 ? options.pilotIds : await allPilotIds()
    console.log(
        `==> syncing ${pilotIds.length} pilot${pilotIds.length === 1 ? '' : 's'}` +
        (options.dryRun ? ' (dry run)' : '')
    )

    let failures = 0
    for (const pilotId of pilotIds) {
        const ok = await syncPilot(pilotId, options.dryRun)
        if (!ok) failures++
    }

    console.log(`==> done, ${pilotIds.length - failures} of ${pilotIds.length} synced`)
    if (failures > 0) {
        process.exitCode = 1
    }
}

main()
    .catch(error => {
        console.error(`sync failed: ${error?.message ?? error}`)
        process.exitCode = 1
    })
    .finally(async () => {
        // Without this the pool keeps the process alive and the job hangs after
        // printing everything it had to say.
        await end().catch(() => undefined)
    })
