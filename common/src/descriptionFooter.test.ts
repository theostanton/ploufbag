import {describe, expect, it} from "vitest";
import {
    DESCRIPTION_DOMAIN,
    DESCRIPTION_FOOTER,
    formattedStatsPattern,
    isFormattedDescription,
    LEGACY_DESCRIPTION_DOMAINS,
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
