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
export const LEGACY_DESCRIPTION_DOMAINS = ['paragliderstats.com'] as const;

export const DESCRIPTION_FOOTER = `🌐 ${DESCRIPTION_DOMAIN}`;

const ALL_DESCRIPTION_DOMAINS = [DESCRIPTION_DOMAIN, ...LEGACY_DESCRIPTION_DOMAINS];

/** Alternation of every domain we have ever stamped, dots escaped. */
const DOMAIN_ALTERNATION = ALL_DESCRIPTION_DOMAINS
    .map(domain => domain.replace(/\./g, '\\.'))
    .join('|');

/**
 * Matches an existing stats block: from the first stats glyph through to the
 * footer domain.
 *
 * The character class is carried over verbatim from the original expression.
 * These glyphs are not single UTF-16 code units — 🪂 is a surrogate pair and
 * ↗️/↘️ are a base arrow plus U+FE0F — so without the `u` flag the class matches
 * their constituent units rather than the glyphs as such. That is loose, but it
 * is the behaviour that has been matching real descriptions in production, and a
 * domain migration is the wrong moment to also tighten it.
 */
export function formattedStatsPattern(): RegExp {
    return new RegExp(`[🪂↗️↘️][\\s\\S]*(?:${DOMAIN_ALTERNATION})`);
}

/**
 * True when this description already carries a stats block we wrote, under the
 * current domain or any legacy one.
 */
export function isFormattedDescription(description: string): boolean {
    return ALL_DESCRIPTION_DOMAINS.some(domain => description.includes(`🌐 ${domain}`));
}
