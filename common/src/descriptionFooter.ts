/**
 * The footer stamped onto every Strava activity description we write, and the
 * matchers used to recognise a description we have already written.
 *
 * These live together because the write side and the read side have to agree
 * exactly. They were previously three copies of a bare string literal plus two
 * hand-rolled regexes, which is precisely the shape that breaks during a domain
 * migration: the writer moves to the new domain while the matcher keeps looking
 * for the old one.
 */

/** Domain shown in the footer of newly written descriptions. */
export const DESCRIPTION_DOMAIN = 'ploufbag.com';

/**
 * Domains we used to stamp. Descriptions already published to Strava still carry
 * these, so the matchers below must keep recognising them.
 *
 * Remove an entry only once every activity bearing it has been rewritten by a
 * full re-sync — until then, dropping it makes those activities read as
 * unformatted, and `updateDescription` responds to "unformatted" by *appending*
 * a stats block rather than replacing one. The visible symptom is an activity
 * with two stats blocks, and it is not self-healing.
 */
export const LEGACY_DESCRIPTION_DOMAINS = [
    'paragliderstats.com',
    // Predates paragliderstats.com. Missing from this list until 2026-08-15, which
    // is why 5 live flights carry it — 4 cleanly, and 1 with two stacked stats
    // blocks, the exact corruption described above from the previous migration.
    'parastats.info',
] as const;

/**
 * Length of a flight slug, and the character set it is drawn from. Must stay in
 * step with generate_flight_slug() in create_flights.sql, which is what actually
 * mints them.
 */
export const SLUG_LENGTH = 5;
const SLUG_CHARACTER_CLASS = '[a-z0-9]';

/** Matches a slug exactly, for validating a path segment before hitting the database. */
export const SLUG_PATTERN = new RegExp(`^${SLUG_CHARACTER_CLASS}{${SLUG_LENGTH}}$`);

/** The short public URL for a flight, e.g. `ploufbag.com/a45nz`. */
export function flightUrl(slug: string): string {
    return `${DESCRIPTION_DOMAIN}/${slug}`;
}

/**
 * The footer line stamped at the bottom of a description.
 *
 * With a slug it links to the flight itself; without one it degrades to the bare
 * domain. The slugless form is what preview rendering uses — a preview has no
 * flight behind it — and is also the shape every description published before
 * slugs existed still carries.
 */
export function descriptionFooter(slug?: string): string {
    return slug ? `🌐 ${flightUrl(slug)}` : `🌐 ${DESCRIPTION_DOMAIN}`;
}

/** The slugless footer. Legacy descriptions; real flights use `descriptionFooter(slug)`. */
export const DESCRIPTION_FOOTER = descriptionFooter();

/**
 * Stand-in slug for preference previews, which render a description for a flight
 * that does not exist and so has no slug of its own. Showing the bare domain
 * there would misrepresent what actually gets published.
 */
export const SAMPLE_SLUG = 'a45nz';

const ALL_DESCRIPTION_DOMAINS = [DESCRIPTION_DOMAIN, ...LEGACY_DESCRIPTION_DOMAINS];

/**
 * Alternation of every domain we have ever stamped, dots escaped, each allowing
 * an optional `/slug` suffix.
 *
 * The suffix is optional because descriptions predating slugs end at the bare
 * domain, and it is attached to *every* domain rather than only the current one
 * because that is what survives the next domain migration: whatever domain is
 * current today will be a legacy entry tomorrow, and by then it will have
 * published slugs behind it.
 */
const DOMAIN_ALTERNATION = ALL_DESCRIPTION_DOMAINS
    .map(domain => `${domain.replace(/\./g, '\\.')}(?:/${SLUG_CHARACTER_CLASS}{${SLUG_LENGTH}})?`)
    .join('|');

/**
 * Matches an existing stats block: from the first stats glyph through to the
 * footer domain, and through the `/slug` after it when one is present.
 *
 * Consuming the slug is load-bearing. The match is what gets replaced by the
 * next description update, so if it stopped at the domain it would rewrite
 * everything up to `ploufbag.com` and leave the old `/a45nz` stranded on the
 * end. The pilot's description would grow a fragment per update — `…/a45nz` on
 * the first, `…/a45nz/a45nz` on the second — and, like the double-stats-block
 * failure above, it would not self-heal.
 *
 * The `u` flag is load-bearing and must not be dropped. Without it the character
 * class is a set of UTF-16 *code units*, not characters: 🪂 is U+1FA82, i.e. the
 * surrogate pair 🪂, so an unflagged class contains the bare lead
 * surrogate \uD83E. That lead is shared by every emoji in U+1F900–U+1FAFF — 🦋,
 * 🥇, 🧗 and hundreds more — so the class matched the first half of whichever
 * emoji a pilot had opened their own text with. Combined with the greedy
 * `[\s\S]*`, the match then began at the pilot's prose instead of at our stats
 * block, and replacing it silently deleted what they had written.
 *
 * That stayed invisible while such descriptions took the *append* branch. Adding
 * their footer domain to the legacy list routes them to this replace branch,
 * which is what turned latent looseness into data loss.
 *
 * With `u`, the class is three characters (plus the U+FE0F variation selectors
 * that follow ↗/↘), and matching starts at a real stats glyph.
 */
export function formattedStatsPattern(): RegExp {
    return new RegExp(`[🪂↗️↘️][\\s\\S]*(?:${DOMAIN_ALTERNATION})`, 'u');
}

/**
 * True when this description already carries a stats block we wrote, under the
 * current domain or any legacy one.
 *
 * Takes a nullable description because the database hands one over. The column
 * is declared `not null` in create_flights.sql, but that file has only ever run
 * as `create table if not exists`, so the constraint never reached an instance
 * whose flights table predates it -- and one NULL row there was enough to throw
 * `Cannot read properties of null (reading 'includes')` out of a promotion,
 * abort the whole sync, and return a 500 to the workflow. A missing description
 * is not an error; it is an activity the pilot never typed anything on.
 */
export function isFormattedDescription(description: string | null | undefined): boolean {
    if (!description) {
        return false;
    }
    return ALL_DESCRIPTION_DOMAINS.some(domain => description.includes(`🌐 ${domain}`));
}

/**
 * A description with our stats block taken back out.
 *
 * The counterpart to writing one. When a pilot says an activity was not a flight
 * after all, whatever we published onto it has to come off in the same action --
 * the alternative is our text sitting on somebody's Strava activity for ever,
 * with nothing in the product still claiming responsibility for it.
 *
 * Built on the same `formattedStatsPattern()` the writer replaces with, so the
 * two cannot drift. That pattern's own comments describe two occasions when a
 * description writer corrupted live activities; the same care applies here, and
 * the same rule: if there is no block to remove, change nothing at all.
 */
/**
 * A line the pilot wrote to name their wing: `🪂 Ronin12`.
 *
 * Built rather than written as a literal, the same way formattedStatsPattern is:
 * the site typechecks this package's source against a target that rejects the
 * `u` flag on a regex literal, and a bare surrogate pair in a pattern is the
 * kind of thing that works until it does not.
 */
const WING_LINE = new RegExp('^\\s*🪂', 'u');

/**
 * A description with our stats block in it, wherever it belongs.
 *
 * There are three shapes a description arrives in and only two of them were
 * handled. It used to be, in effect:
 *
 *     description.replace(`🪂 ${flight.wing}`, stats)
 *
 * which publishes nothing at all when that exact text is not present -- and
 * then compares the result to the original, finds it unchanged, and reports
 * success. Two ordinary situations hit it:
 *
 *   * The flight has no wing. `flights.wing` is nullable, and promoteFlights
 *     deliberately imports an unattributed flight rather than discarding it --
 *     its own comment says the stats get written anyway. They did not: the
 *     replace looked for the literal text `🪂 null`.
 *   * The wing named in the description is not one we know. A pilot who buys a
 *     glider and types `🪂 Ronin12` before adding it to their wings has a
 *     flight whose wing resolves to nothing, for exactly the same outcome.
 *
 * Both published nothing and said nothing, which is how a backfill of
 * twenty-six flights left twenty-six Strava activities untouched and still
 * reported success.
 *
 * So: replace a block of ours if there is one, replace the pilot's own 🪂 line
 * if there is one -- matched as a whole line rather than as a substring, so
 * that a wing called `Ronin` no longer chews the front off `🪂 Ronin12` -- and
 * otherwise put the stats at the end, which is what "append" claimed to mean.
 *
 * Idempotent by construction: whatever branch runs, the result carries a footer,
 * so the next call takes the first branch and replaces in place.
 */
export function withStatsBlock(
    description: string | null | undefined,
    stats: string
): string {
    const existing = description ?? '';

    if (isFormattedDescription(existing)) {
        return existing.replace(formattedStatsPattern(), stats);
    }

    // The pilot's 🪂 line is theirs, and we only take it over when we are
    // putting a better one back: our block opens with its own 🪂 line whenever
    // the flight has a wing. When it does not -- an unattributed flight, or one
    // naming a glider we have no row for -- replacing would quietly delete the
    // one thing the pilot did tell us about it. Then the stats go underneath and
    // the annotation stays.
    const statsNamesTheWing = stats.split('\n').some(line => WING_LINE.test(line));
    if (statsNamesTheWing) {
        const lines = existing.split('\n');
        const wingLine = lines.findIndex(line => WING_LINE.test(line));
        if (wingLine >= 0) {
            lines[wingLine] = stats;
            return lines.join('\n');
        }
    }

    return existing.trim().length === 0 ? stats : `${existing}\n${stats}`;
}

export function withoutStatsBlock(description: string): string {
    if (!isFormattedDescription(description)) {
        return description
    }
    const stripped = description.replace(formattedStatsPattern(), '')
    // Collapse the hole the block leaves behind: it was usually preceded by the
    // pilot's own text and a blank line, and leaving three newlines behind is a
    // visible scar that says something used to be here.
    return stripped.replace(/\n{3,}/g, '\n\n').trim()
}
