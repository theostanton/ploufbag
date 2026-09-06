import { describe, expect, it } from 'vitest'
import { extractWingName, normaliseWingName, wingNameFromDescription } from './classify'

/**
 * Turning what a pilot typed into a name we are willing to store.
 *
 * extractWingName has always read the 🪂 line correctly. What was missing was
 * anywhere for the answer to go: a name matching no row in `wings` was
 * discarded, so a pilot who bought a glider and wrote "🪂 Susi" got "Unknown
 * wing" on every flight and a stats block with no 🪂 line at all. These are the
 * cases the two writers that now create wings -- promotion and the
 * reattribution pass -- hand to Wings.ensureNamed.
 *
 * The property that matters most here is that nothing non-empty is refused.
 * The reattribution pass picks its work with a SQL predicate and decides what
 * to do with it here, so a name this rejected would be a row the query keeps
 * offering and the pass keeps declining -- a backlog that cannot go down, which
 * is exactly the treadmill #44 was about.
 */

describe('reading a wing name out of a description', () => {
    it('reads the line a pilot wrote', () => {
        expect(wingNameFromDescription('🪂 Susi')).toBe('Susi')
    })

    it('reads it out of a block we published ourselves', () => {
        // The whole description of a real flight, as stored, from the sync that
        // prompted this: the wing line is the pilot's, the rest is ours.
        const description = [
            '🪂 Susi',
            '↗️ Chamonix - Plan Praz - Brevent 7kmh/13kmh SW',
            '↘️ Chamonix - le Savoy 14kmh/19kmh W',
            '2026        92 flights / 28h 46min',
            'All Time    318 flights / 96h 5min',
            '🌐 ploufbag.com/ok3dm',
        ].join('\n')

        expect(wingNameFromDescription(description)).toBe('Susi')
    })

    it('does not read our own aggregate columns back as part of the name', () => {
        // What the line looks like once the wing is known. Re-importing must not
        // decide the glider is called "Susi 70 flights / 96h 5min".
        expect(wingNameFromDescription('🪂 Susi        70 flights / 96h 5min')).toBe('Susi')
    })

    it('has nothing to say about a description that names no wing', () => {
        expect(wingNameFromDescription('Evening at Planpraz')).toBeNull()
        expect(wingNameFromDescription('')).toBeNull()
        expect(wingNameFromDescription(null)).toBeNull()
    })
})

describe('normalising a wing name', () => {
    it('collapses the padding the old importer captured', () => {
        // Production carries these: the wing was read off a padded aggregate
        // column and stored with the padding, so "ronin      " hashes to a
        // different track colour from "ronin" and links to a per-wing page
        // holding only itself.
        expect(normaliseWingName('ronin      ')).toBe('ronin')
        expect(normaliseWingName('susi               ')).toBe('susi')
    })

    it('collapses whitespace inside the name too, as wing_key does', () => {
        // wing_key folds all whitespace, so "Zeno  2" and "Zeno 2" are one
        // glider. The display name has to agree, or the row shows a spelling
        // its own key does not have.
        expect(normaliseWingName('Zeno  2')).toBe('Zeno 2')
        expect(normaliseWingName(' Zeno\t2 ')).toBe('Zeno 2')
    })

    it('refuses only what is genuinely empty', () => {
        expect(normaliseWingName('   ')).toBeNull()
        expect(normaliseWingName('')).toBeNull()
        expect(normaliseWingName(null)).toBeNull()
        expect(normaliseWingName(undefined)).toBeNull()
    })

    it('truncates a name that is too long rather than rejecting it', () => {
        // The convergence property. A rejection here is a flight the backfill
        // pass can never finish with.
        const long = 'A'.repeat(200)
        const name = normaliseWingName(long)

        expect(name).not.toBeNull()
        expect(name!.length).toBe(60)
    })

    it('does not truncate through the middle of a surrogate pair', () => {
        // Half a pair is an invalid string, and Postgres rejects it. Rare --
        // wing names come from after the 🪂 -- but a failed write is worse than
        // a name one character shorter.
        const name = normaliseWingName('B'.repeat(59) + '🪂')

        expect(name).toBe('B'.repeat(59))
    })

    it('keeps a name that is already fine exactly as the pilot spelled it', () => {
        // The pilot's own word for their own glider. Case, punctuation and
        // digits all survive; only whitespace is touched.
        for (const name of ['Susi', 'Ronin12', 'BGD Epic', 'Zeno 2', 'Forgot', 'X-Alps 6']) {
            expect(normaliseWingName(name)).toBe(name)
        }
    })

    it('agrees with what extractWingName hands it', () => {
        // The two are always used together, and a name the parser produces must
        // survive the normaliser -- see the convergence note above.
        const extracted = extractWingName('🪂 Ronin12')
        expect(extracted).toBe('Ronin12')
        expect(normaliseWingName(extracted)).toBe('Ronin12')
    })
})
