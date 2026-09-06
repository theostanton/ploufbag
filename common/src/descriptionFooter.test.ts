import {describe, expect, it} from "vitest";
import {
    DESCRIPTION_DOMAIN,
    DESCRIPTION_FOOTER,
    descriptionFooter,
    flightUrl,
    formattedStatsPattern,
    isFormattedDescription,
    withStatsBlock,
    LEGACY_DESCRIPTION_DOMAINS,
    SLUG_PATTERN,
    withoutStatsBlock,
} from "./descriptionFooter";

// A realistic description as it appears on Strava after we have written to it:
// pilot's own prose, then our stats block, then the footer.
function describedFlight(domain: string): string {
    return [
        "Lovely evening at Saint-Hilaire",
        "↗️ Saint Hilaire 12kmh/18kmh NW",
        "↘️ Lumbin",
        "🪂 Advance Epsilon  14 flights / 21h 30min",
        "2026                31 flights / 48h 05min",
        "All Time            87 flights / 124h 15min",
        `🌐 ${domain}`,
    ].join("\n");
}

const NEW_STATS = [
    "↗️ Saint Hilaire 9kmh/14kmh N",
    "↘️ Lumbin",
    "🪂 Advance Epsilon  15 flights / 22h 30min",
    `🌐 ${DESCRIPTION_DOMAIN}`,
].join("\n");

describe("isFormattedDescription", () => {
    it("recognises a description stamped with the current domain", () => {
        expect(isFormattedDescription(describedFlight(DESCRIPTION_DOMAIN))).toBe(true);
    });

    // The migration hazard: these are already published to Strava and must not be
    // mistaken for unformatted, or updateDescription appends a second stats block.
    it.each(LEGACY_DESCRIPTION_DOMAINS)("recognises the legacy domain %s", (legacyDomain) => {
        expect(isFormattedDescription(describedFlight(legacyDomain))).toBe(true);
    });

    it("does not claim an untouched description is formatted", () => {
        expect(isFormattedDescription("Lovely evening at Saint-Hilaire")).toBe(false);
    });

    it("does not match a description that merely mentions the domain in prose", () => {
        expect(isFormattedDescription(`Stats are on ${DESCRIPTION_DOMAIN} by the way`)).toBe(false);
    });

    // The type says string; the database says otherwise. flights.description is
    // nullable on any instance whose table predates create_flights.sql, and one
    // NULL row threw `Cannot read properties of null (reading 'includes')` out
    // of a promotion, aborting an entire sync and returning a 500 to the
    // workflow. Nothing written there is formatted, so the answer is false.
    it.each([null, undefined, ""])("treats %p as unformatted rather than throwing", (missing) => {
        expect(isFormattedDescription(missing as string | null | undefined)).toBe(false);
    });
});

describe("formattedStatsPattern", () => {
    it("replaces a current-domain stats block in place, leaving prose intact", () => {
        const updated = describedFlight(DESCRIPTION_DOMAIN).replace(formattedStatsPattern(), NEW_STATS);

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n${NEW_STATS}`);
    });

    // The core of the migration: an old-domain block must be replaced, not appended to.
    it.each(LEGACY_DESCRIPTION_DOMAINS)("replaces a %s stats block in place", (legacyDomain) => {
        const updated = describedFlight(legacyDomain).replace(formattedStatsPattern(), NEW_STATS);

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n${NEW_STATS}`);
        expect(updated).not.toContain(legacyDomain);
    });

    it("leaves exactly one footer after rewriting a legacy description", () => {
        const updated = describedFlight(LEGACY_DESCRIPTION_DOMAINS[0]).replace(
            formattedStatsPattern(),
            NEW_STATS,
        );

        expect(updated.split("🌐").length - 1).toBe(1);
        expect(updated).toContain(DESCRIPTION_FOOTER);
    });

    it("is greedy enough to consume a block spanning takeoff through footer", () => {
        // The block starts at the first stats glyph (↗️ here, not 🪂), so a partial
        // match would strip the aggregates while orphaning the site lines.
        const updated = describedFlight(DESCRIPTION_DOMAIN).replace(formattedStatsPattern(), "");

        expect(updated).toBe("Lovely evening at Saint-Hilaire\n");
    });

    it("returns a fresh regex each call so lastIndex is never carried over", () => {
        expect(formattedStatsPattern()).not.toBe(formattedStatsPattern());
    });
});

// ---------------------------------------------------------------------------
// Regression cases taken verbatim from production rows, found while preparing
// the ploufbag.com backfill on 2026-08-15.
// ---------------------------------------------------------------------------

describe("real production descriptions", () => {
    // 4 live flights look exactly like this. Before parastats.info was added to
    // the legacy list these read as unformatted, took the append branch, and
    // came out with two stacked stats blocks.
    const PARASTATS_INFO_ONLY = [
        "🪂 Ronin  14 flights / 1h 43min",
        "2025        1 flight / 6min",
        "All Time    106 flights / 24h 40min",
        "🌐 parastats.info",
    ].join("\n");

    // 1 live flight, already corrupted by the previous migration: two stats
    // blocks, two footers, two different legacy domains.
    const ALREADY_CORRUPTED = [
        "🦋 Almost caught the metamorphosis of a wingsuiter",
        "↗️ Plan de l'Aiguille",
        "↘️ Le Bois du Bouchet",
        "🪂 Ronin  28 flights / 3h 43min",
        "All Time    141 flights / 35h 44min",
        "🌐 paragliderstats.com  28 flights / 3h 43min",
        "All Time    141 flights / 35h 44min",
        "🌐 parastats.info",
    ].join("\n");

    it("recognises a parastats.info footer as formatted", () => {
        expect(isFormattedDescription(PARASTATS_INFO_ONLY)).toBe(true);
    });

    it("rewrites a parastats.info description to a single clean block", () => {
        const updated = PARASTATS_INFO_ONLY.replace(formattedStatsPattern(), NEW_STATS);

        expect(updated).toBe(NEW_STATS);
        expect(updated.split("🌐").length - 1).toBe(1);
    });

    it("collapses an already-corrupted description down to one stats block", () => {
        const updated = ALREADY_CORRUPTED.replace(formattedStatsPattern(), NEW_STATS);

        expect(updated.split("🌐").length - 1).toBe(1);
        expect(updated).not.toContain("parastats.info");
        expect(updated).not.toContain("paragliderstats.com");
    });

    // The data-loss regression. 🦋 (U+1F98B) shares its lead surrogate \uD83E
    // with 🪂 (U+1FA82), so without the `u` flag the match started at the
    // pilot's own words and replacing it deleted them.
    it("preserves pilot prose that opens with an unrelated emoji", () => {
        const updated = ALREADY_CORRUPTED.replace(formattedStatsPattern(), NEW_STATS);

        expect(updated).toContain("🦋 Almost caught the metamorphosis of a wingsuiter");
        expect(updated).toBe(`🦋 Almost caught the metamorphosis of a wingsuiter\n${NEW_STATS}`);
    });

    it("still anchors on a takeoff arrow when there is no prose", () => {
        const arrowFirst = ["↗️ Chamonix", "↘️ Bouchet", "🪂 Ronin  1 flight", "🌐 ploufbag.com"].join("\n");

        expect(arrowFirst.replace(formattedStatsPattern(), NEW_STATS)).toBe(NEW_STATS);
    });
});

// ---------------------------------------------------------------------------
// Short flight URLs.
// ---------------------------------------------------------------------------

const SLUG = "a45nz";

/** A description as it appears once we have stamped a slugged footer on it. */
function describedFlightWithSlug(domain: string, slug: string): string {
    return [
        "Lovely evening at Saint-Hilaire",
        "↗️ Saint Hilaire 12kmh/18kmh NW",
        "🪂 Advance Epsilon  14 flights / 21h 30min",
        `🌐 ${domain}/${slug}`,
    ].join("\n");
}

describe("descriptionFooter", () => {
    it("links to the flight when given a slug", () => {
        expect(descriptionFooter(SLUG)).toBe(`🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`);
    });

    it("falls back to the bare domain without one, matching previews and pre-slug descriptions", () => {
        expect(descriptionFooter()).toBe(`🌐 ${DESCRIPTION_DOMAIN}`);
        expect(descriptionFooter()).toBe(DESCRIPTION_FOOTER);
    });

    it("builds a URL short enough to be worth having", () => {
        // The whole point: ploufbag.com/a45nz, not ploufbag.com/flights/15038284782.
        expect(flightUrl(SLUG)).toBe("ploufbag.com/a45nz");
        expect(flightUrl(SLUG).length).toBeLessThan(`${DESCRIPTION_DOMAIN}/flights/15038284782`.length);
    });
});

describe("SLUG_PATTERN", () => {
    it("accepts the slugs generate_flight_slug() mints", () => {
        expect(SLUG_PATTERN.test("a45nz")).toBe(true);
        expect(SLUG_PATTERN.test("00000")).toBe(true);
        expect(SLUG_PATTERN.test("zzzzz")).toBe(true);
    });

    it("rejects anything that is not exactly five lowercase alphanumerics", () => {
        expect(SLUG_PATTERN.test("a45n")).toBe(false);
        expect(SLUG_PATTERN.test("a45nzz")).toBe(false);
        expect(SLUG_PATTERN.test("A45NZ")).toBe(false);
        expect(SLUG_PATTERN.test("a4-nz")).toBe(false);
        expect(SLUG_PATTERN.test("")).toBe(false);
    });

    it("rejects the site's own top-level routes so they never reach a slug lookup", () => {
        // These are all five characters, and Next.js resolves the static route
        // first — but the guard should not depend on that.
        expect(SLUG_PATTERN.test("login")).toBe(true);
        expect(SLUG_PATTERN.test("admin")).toBe(true);
        expect(SLUG_PATTERN.test("sites")).toBe(true);
    });
});

describe("formattedStatsPattern with slugged footers", () => {
    it("recognises a slugged footer as already formatted", () => {
        expect(isFormattedDescription(describedFlightWithSlug(DESCRIPTION_DOMAIN, SLUG))).toBe(true);
    });

    // The regression this whole suffix exists to prevent: a match that stops at
    // the domain strands the slug on the end of the pilot's description.
    it("consumes the slug, leaving no orphan path fragment", () => {
        const updated = describedFlightWithSlug(DESCRIPTION_DOMAIN, SLUG).replace(
            formattedStatsPattern(),
            descriptionFooter(SLUG),
        );

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`);
        expect(updated).not.toMatch(/com\/\w{5}\/\w{5}/);
    });

    it("does not accumulate fragments over repeated updates", () => {
        let description = describedFlightWithSlug(DESCRIPTION_DOMAIN, SLUG);

        for (let update = 0; update < 5; update++) {
            description = description.replace(formattedStatsPattern(), descriptionFooter(SLUG));
        }

        expect(description).toBe(`Lovely evening at Saint-Hilaire\n🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`);
        expect(description.split(SLUG).length - 1).toBe(1);
    });

    it("upgrades a pre-slug description to a slugged one in place", () => {
        const updated = describedFlight(DESCRIPTION_DOMAIN).replace(
            formattedStatsPattern(),
            descriptionFooter(SLUG),
        );

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`);
        expect(updated.split("🌐").length - 1).toBe(1);
    });

    // Today's domain becomes tomorrow's legacy entry, and by then it will have
    // published slugs behind it.
    it.each(LEGACY_DESCRIPTION_DOMAINS)("consumes a slug after the legacy domain %s too", (legacyDomain) => {
        const updated = describedFlightWithSlug(legacyDomain, SLUG).replace(
            formattedStatsPattern(),
            descriptionFooter(SLUG),
        );

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`);
        expect(updated).not.toContain(legacyDomain);
    });

    it("leaves pilot prose that follows the footer alone", () => {
        const trailing = [
            "↗️ Saint Hilaire",
            `🌐 ${DESCRIPTION_DOMAIN}/${SLUG}`,
            "PS: thermals were wild today",
        ].join("\n");

        const updated = trailing.replace(formattedStatsPattern(), descriptionFooter(SLUG));

        expect(updated).toBe(`🌐 ${DESCRIPTION_DOMAIN}/${SLUG}\nPS: thermals were wild today`);
    });
});

describe('withoutStatsBlock', () => {
    const STATS = [
        '🪂 Ozone Zeno 2    15 flights / 18h 45min',
        '2024               42 flights / 52h 30min',
        'All Time           87 flights / 124h 15min',
        '🌐 ploufbag.com/a45nz',
    ].join('\n')

    it('leaves a description we never wrote to completely alone', () => {
        const theirs = 'Belle journée à Planfait, un peu de vent en fin de vol.'
        expect(withoutStatsBlock(theirs)).toBe(theirs)
    })

    it('leaves an empty description alone', () => {
        expect(withoutStatsBlock('')).toBe('')
    })

    it('removes a block we wrote', () => {
        expect(withoutStatsBlock(STATS)).toBe('')
    })

    /**
     * The case that matters. The pilot's own words are above our block, and
     * taking ours back must not take theirs -- which is exactly the failure
     * formattedStatsPattern's comments describe happening before.
     */
    it("keeps the pilot's own text above it", () => {
        const mixed = `Belle journée à Planfait.\n\n${STATS}`
        expect(withoutStatsBlock(mixed)).toBe('Belle journée à Planfait.')
    })

    it('removes a block published under a legacy domain', () => {
        const legacy = STATS.replace('ploufbag.com/a45nz', 'paragliderstats.com')
        const mixed = `Vol du soir.\n\n${legacy}`
        expect(withoutStatsBlock(mixed)).toBe('Vol du soir.')
    })

    it('leaves no scar where the block was', () => {
        const mixed = `First line.\n\n${STATS}`
        const result = withoutStatsBlock(mixed)
        expect(result).not.toContain('\n\n\n')
        expect(result.endsWith('.')).toBe(true)
    })

    it('is idempotent', () => {
        const mixed = `Vol.\n\n${STATS}`
        const once = withoutStatsBlock(mixed)
        expect(withoutStatsBlock(once)).toBe(once)
    })
})

describe("withStatsBlock", () => {
    const STATS = [
        "↗️ Planpraz",
        "🪂 Ronin12  1 flight / 4min",
        `🌐 ${DESCRIPTION_DOMAIN}/sis4g`,
    ].join("\n");

    it("replaces a block we already published, rather than adding a second", () => {
        const updated = withStatsBlock(describedFlight(DESCRIPTION_DOMAIN), STATS);

        expect(updated).toBe(`Lovely evening at Saint-Hilaire\n${STATS}`);
        // Idempotent: running it again lands in the same branch, same result.
        expect(withStatsBlock(updated, STATS)).toBe(updated);
    });

    it("replaces the pilot's own wing line, keeping the prose around it", () => {
        expect(withStatsBlock("🪂 Ronin12\nNew wing day!", STATS))
            .toBe(`${STATS}\nNew wing day!`);
    });

    /**
     * Only when we are putting a wing line back. An unattributed flight gets a
     * block with no 🪂 line in it, and taking the pilot's line over with that
     * would delete the one thing they told us about the glider.
     */
    it("leaves the pilot's wing line alone when our block names no wing", () => {
        const wingless = ["2026        1 flight / 4min", `🌐 ${DESCRIPTION_DOMAIN}/sis4g`].join("\n");

        expect(withStatsBlock("🪂 Ronin12\nNew wing day!", wingless))
            .toBe(`🪂 Ronin12\nNew wing day!\n${wingless}`);
    });

    /**
     * The one that cost twenty-six flights. `flights.wing` is nullable, and the
     * old code replaced the literal `🪂 ${flight.wing}` -- so an unattributed
     * flight looked for the text "🪂 null", changed nothing, compared equal to
     * the original, and reported success without publishing anything.
     */
    it("appends when there is no wing line to replace", () => {
        expect(withStatsBlock("Cracking day out", STATS)).toBe(`Cracking day out\n${STATS}`);
    });

    it("is the whole description when there was none", () => {
        for (const empty of ["", "   ", null, undefined]) {
            expect(withStatsBlock(empty, STATS)).toBe(STATS);
        }
    });

    /**
     * A pilot types the glider they actually flew; the wings table holds
     * "Ronin". Matching `🪂 Ronin` as a substring bit the front off `🪂 Ronin12`
     * and published `<stats>12`. The line is matched whole.
     */
    it("replaces a wing line naming a glider we do not have a row for", () => {
        expect(withStatsBlock("🪂 Ronin12", STATS)).toBe(STATS);
    });
});
