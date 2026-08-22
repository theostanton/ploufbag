/**
 * The gliders a pilot can pick from when adding a wing.
 *
 * A typeahead over real models rather than a blank text field, for three
 * reasons: it fixes spelling, which is the whole reason wings were a mess as
 * free text; it gives us the manufacturer and model as separate fields without
 * asking for them; and it means the common case is one keystroke and a tap.
 *
 * Nothing here is authoritative and nothing validates against it -- a pilot
 * flying something not on this list types the name and it is accepted verbatim.
 * The list exists to make the common case fast, not to constrain the rare one.
 */

export type WingMake = {
    manufacturer: string
    models: string[]
}

export type WingSuggestion = {
    /** What goes in the name field: "Ozone Zeno 2". */
    name: string
    manufacturer: string
    model: string
}

export const WING_CATALOGUE: WingMake[] = [
    {
        manufacturer: 'Ozone',
        models: ['Rush 6', 'Rush 5', 'Zeno 2', 'Zeno', 'Enzo 3', 'Mantra M7', 'Alpina 4', 'Buzz Z6',
            'Geo 7', 'Delta 4', 'Swift 6', 'LM7', 'Photon', 'Zeolite 2'],
    },
    {
        manufacturer: 'Advance',
        models: ['Iota 3', 'Epsilon 9', 'Sigma 11', 'Omega ULS', 'Alpha 7', 'Pi 3', 'Omikron', 'Xi'],
    },
    {
        manufacturer: 'Nova',
        models: ['Mentor 7', 'Ion 7', 'Codex', 'Xenon', 'Aonic', 'Phantom', 'Prion 5', 'Doubleskin'],
    },
    {
        manufacturer: 'Gin',
        models: ['Bonanza 3', 'Explorer 3', 'Atlas 3', 'Camino', 'Leopard 2', 'Sprint 4', 'Yeti 6'],
    },
    {
        manufacturer: 'Niviuk',
        models: ['Artik 6', 'Ikuma 3', 'Hook 6', 'Klimber 3', 'Peak 6', 'Icepeak Evox', 'Koyot 5'],
    },
    {
        manufacturer: 'Skywalk',
        models: ['Cumeo 2', 'Mescal 6', 'Chili 5', 'Arriba 4', 'X-Alps 6', 'Tequila 6', 'Poison X-Alps'],
    },
    {
        manufacturer: 'BGD',
        models: ['Base 3', 'Cure 3', 'Epic', 'Magic 2', 'Punk', 'Seed 2', 'Tala 2', 'Riot'],
    },
    {
        manufacturer: 'Phi',
        models: ['Allegro X', 'Maestro 2', 'Symphonia 2', 'Tenor 4', 'Sonata 2', 'Beat', 'Scala 2'],
    },
    {
        manufacturer: 'Supair',
        models: ['Leaf 3', 'Eona 3', 'Savage', 'Step', 'Taska', 'Birdy'],
    },
    {
        manufacturer: 'Triple Seven',
        models: ['Rook 4', 'Queen 3', 'King 2', 'Knight 2', 'Pawn 2', 'Deck'],
    },
    {
        manufacturer: 'Air Design',
        models: ['Rise 4', 'Vivo 2', 'Volt 4', 'Susi 4', 'Hero 2', 'UFO 2'],
    },
    {
        manufacturer: 'Swing',
        models: ['Nyos RS', 'Mito', 'Arcus RS', 'Agera RS', 'Twin RS'],
    },
    {
        manufacturer: 'Mac Para',
        models: ['Eden 7', 'Elan 3', 'Muse 5', 'Illusion'],
    },
    {
        manufacturer: 'Flow',
        models: ['XC Racer 2', 'Fusion 2', 'Freedom 2', 'Spectra'],
    },
    {
        manufacturer: 'Icaro',
        models: ['Pica 2', 'Gravis 2', 'Instinct', 'Maverick 3'],
    },
    {
        manufacturer: 'U-Turn',
        models: ['Blacklight 3', 'Infinity 5', 'Emotion 4', 'Thrill 4'],
    },
]

/** Every make and model as one flat, searchable list. */
export const WING_SUGGESTIONS: WingSuggestion[] = WING_CATALOGUE.flatMap(make =>
    make.models.map(model => ({
        name: `${make.manufacturer} ${model}`,
        manufacturer: make.manufacturer,
        model,
    }))
)

/**
 * Suggestions for what the pilot has typed so far.
 *
 * Every whitespace-separated term has to appear somewhere in the full name, so
 * "oz zen" finds "Ozone Zeno 2" -- pilots type the make abbreviated far more
 * often than they type it out. A match at the start of the name outranks one in
 * the middle, so "rush" puts "Ozone Rush 6" above "Ozone Rush 5" only by the
 * catalogue's own order rather than by accident.
 */
export function searchWingCatalogue(query: string, limit: number = 6): WingSuggestion[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) {
        return []
    }

    const scored: Array<{ suggestion: WingSuggestion; score: number }> = []
    for (const suggestion of WING_SUGGESTIONS) {
        const haystack = suggestion.name.toLowerCase()
        if (!terms.every(term => haystack.includes(term))) {
            continue
        }
        // Lower is better: a name that starts with the query is the one the
        // pilot almost certainly means.
        const score = haystack.startsWith(terms[0]) ? 0 : 1
        scored.push({ suggestion, score })
    }

    return scored
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map(entry => entry.suggestion)
}
