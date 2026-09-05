import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The schema, in the order it has to be applied.
 *
 * One list, in scripts/manifest.txt, read by the deploy (scripts/migrate.sh),
 * the local cluster (dev/db.sh) and both test suites. There used to be four
 * copies of this order and adding a table meant remembering all of them --
 * which is how create_activities.sql came to exist on a laptop and in the test
 * containers but not in production, where every Strava upload then failed
 * against a table that was not there for a week.
 *
 * A test asserts that every .sql file is either in the manifest or explicitly
 * excluded, so the next one cannot be forgotten in the same way.
 */
export function schemaManifest(scriptsDir: string = defaultScriptsDir()): string[] {
    return fs.readFileSync(path.join(scriptsDir, 'manifest.txt'), 'utf8')
        .split('\n')
        .map(line => line.replace(/#.*/, '').trim())
        .filter(line => line.length > 0)
}

function defaultScriptsDir(): string {
    return path.join(__dirname, 'scripts')
}
