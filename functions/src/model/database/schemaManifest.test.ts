import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { schemaManifest } from './schemaManifest'

/**
 * The manifest against the directory it describes.
 *
 * This is the test that was missing. create_activities.sql was added, wired
 * into two test loaders and a dev script, and never applied to production --
 * where every Strava upload then failed on a table that was not there, for a
 * week, with the only trace in a webhook_events row nobody was reading. Nothing
 * in the repository could have told anyone: the suites were green precisely
 * because they built their own database from their own list.
 *
 * So the rule is now checkable: every script is either applied by the deploy or
 * listed below with a reason it is not.
 */

const SCRIPTS_DIR = path.join(__dirname, 'scripts')

/**
 * Scripts the deploy deliberately does not run.
 *
 * A short list, and it has to stay short: anything here is a script whose
 * absence from a database nobody is checking for.
 */
const NOT_DEPLOYED: Record<string, string> = {
    // Drops and rebuilds webhook_events and task_executions to get rid of the
    // enum types ts-postgres could not decode. Already applied, not idempotent,
    // and running it on every deploy would erase the monitoring history each
    // time -- including the failures that are the record of what went wrong.
    migrate_monitoring_tables_to_varchar:
        'destructive, one-off, already applied',
    // Turns the free text in flights.wing into rows in wings. A data backfill
    // over six years of rows, not schema, and slow enough that re-running it on
    // every deploy is a different kind of risk. dev/db.sh runs it after seeding.
    backfill_wings:
        'data backfill, applied once by hand',
}

function scriptNames(): string[] {
    return fs.readdirSync(SCRIPTS_DIR)
        .filter(name => name.endsWith('.sql'))
        .map(name => name.replace(/\.sql$/, ''))
}

describe('the schema manifest', () => {
    it('accounts for every script in the directory', () => {
        const unaccounted = scriptNames()
            .filter(name => !schemaManifest(SCRIPTS_DIR).includes(name))
            .filter(name => !(name in NOT_DEPLOYED))

        expect(
            unaccounted,
            'Add these to functions/src/model/database/scripts/manifest.txt so ' +
            'the deploy applies them, or to NOT_DEPLOYED with the reason it must not.'
        ).toEqual([])
    })

    it('names only scripts that exist', () => {
        const missing = schemaManifest(SCRIPTS_DIR)
            .filter(name => !fs.existsSync(path.join(SCRIPTS_DIR, `${name}.sql`)))

        expect(missing).toEqual([])
    })

    it('lists nothing twice, which would apply it twice', () => {
        const manifest = schemaManifest(SCRIPTS_DIR)
        expect(manifest.length).toBe(new Set(manifest).size)
    })

    it('keeps what the deploy applies free of anything that loses data', () => {
        // The same rule migrate.sh enforces at run time, checked here so it
        // fails in review rather than half way through an unattended deploy.
        const destructive = /^\s*(drop\s+(table|view|type|column|schema|database)|truncate|delete\s+from)/im

        const dangerous = schemaManifest(SCRIPTS_DIR).filter(name => {
            const sql = fs.readFileSync(path.join(SCRIPTS_DIR, `${name}.sql`), 'utf8')
            if (/^--\s*migrate:\s*destructive-ok/im.test(sql)) {
                return false
            }
            return destructive.test(sql)
        })

        expect(dangerous).toEqual([])
    })

    it('puts each script after the one it depends on', () => {
        const manifest = schemaManifest(SCRIPTS_DIR)
        const at = (name: string) => manifest.indexOf(name)

        // create_wings alters flights; create_activities adds a column to
        // pilots; the description check is a column on activities.
        expect(at('create_wings')).toBeGreaterThan(at('create_flights'))
        expect(at('add_slug_to_flights')).toBeGreaterThan(at('create_flights'))
        expect(at('create_activities')).toBeGreaterThan(at('create_pilots'))
        expect(at('add_description_checked_at_to_activities'))
            .toBeGreaterThan(at('create_activities'))
    })
})
