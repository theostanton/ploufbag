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
 */
export function isFormattedDescription(description: string): boolean {
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
