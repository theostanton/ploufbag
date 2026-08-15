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
