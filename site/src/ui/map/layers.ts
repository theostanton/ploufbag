import type { LayerProps } from 'react-map-gl/mapbox'

/**
 * Layer styling for the two shared sources.
 *
 * Nothing here is rebuilt in response to a route change. Emphasis is a
 * setFeatureState on the handful of features involved plus one paint swap for
 * the rest, so a navigation never re-uploads a source. The implementation this
 * replaces added a source and a layer per flight and threw them all away on the
 * way out.
 */

export const FLIGHTS_SOURCE_ID = 'flights'
export const SITES_SOURCE_ID = 'sites'

/**
 * Opacity ramp shared by the casing, the line and the site markers.
 *
 * Hover beats selected beats everything else. A backgrounded track is still
 * visible -- it is context, and fading it out entirely would leave a flight
 * detail view looking like an empty map, which is the thing this design exists
 * to avoid.
 *
 * Dimming is a paint swap, not a per-feature state. Marking every unselected
 * feature dim would mean a setFeatureState call per flight on every navigation;
 * swapping the fallback branch of one expression is a single call regardless of
 * how many flights there are. Only `hover` and `selected` -- which apply to a
 * handful of features at a time -- are feature-state.
 */
export type EmphasisMode = 'normal' | 'focused'

const opacityByState = (base: number, dimmed: number, mode: EmphasisMode = 'normal'): unknown => [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    1,
    ['boolean', ['feature-state', 'selected'], false],
    1,
    mode === 'focused' ? dimmed : base,
]

/**
 * The opacity paint properties for a given mode, keyed by layer id and paint
 * property, so the emphasis hook can apply them without knowing the ramps.
 *
 * `as const` keeps the property names as literal types rather than widening
 * them to string, which is what lets them be passed to setPaintProperty without
 * a cast that would also hide a genuine typo.
 */
export const opacityPaint = (mode: EmphasisMode) => [
    { layer: 'flights-casing', property: 'line-opacity', value: opacityByState(0.7, 0.1, mode) },
    { layer: 'flights-line', property: 'line-opacity', value: opacityByState(0.9, 0.18, mode) },
    { layer: 'sites-circle', property: 'circle-opacity', value: opacityByState(0.95, 0.28, mode) },
    {
        layer: 'sites-circle',
        property: 'circle-stroke-opacity',
        value: opacityByState(1, 0.28, mode),
    },
    { layer: 'sites-label', property: 'text-opacity', value: opacityByState(1, 0.22, mode) },
] as const

/**
 * Width ramp. Selected and hovered tracks get a wider stroke as well as full
 * opacity, because at low zoom over busy imagery opacity alone does not
 * separate one track from two hundred.
 */
const widthByZoom = (thin: number, thick: number): unknown => [
    'interpolate',
    ['linear'],
    ['zoom'],
    6,
    ['case', ['boolean', ['feature-state', 'selected'], false], thick * 0.9, thin],
    11,
    ['case', ['boolean', ['feature-state', 'selected'], false], thick * 1.6, thin * 1.8],
    15,
    ['case', ['boolean', ['feature-state', 'selected'], false], thick * 2.4, thin * 3],
]

/** Dark halo under every track, so a coloured line reads over snow and rock alike. */
export const flightCasingLayer: LayerProps = {
    id: 'flights-casing',
    type: 'line',
    source: FLIGHTS_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': 'rgba(12, 16, 14, 0.55)',
        'line-width': widthByZoom(3, 5) as never,
        'line-opacity': opacityByState(0.7, 0.1) as never,
    },
}

export const flightLineLayer: LayerProps = {
    id: 'flights-line',
    type: 'line',
    source: FLIGHTS_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': ['get', 'color'],
        'line-width': widthByZoom(1.4, 2.6) as never,
        'line-opacity': opacityByState(0.9, 0.18) as never,
    },
}

/**
 * Invisible fat line for hit-testing.
 *
 * A 1.4px track is essentially untappable on a phone. This gives every track a
 * generous target without making the visible line heavier. It must sit above the
 * visible layers so queryRenderedFeatures reaches it first.
 */
export const flightHitLayer: LayerProps = {
    id: 'flights-hit',
    type: 'line',
    source: FLIGHTS_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': 'rgba(0, 0, 0, 0)',
        'line-width': 22,
    },
}

/** Site markers. Radius carries how heavily a site is used. */
export const siteCircleLayer: LayerProps = {
    id: 'sites-circle',
    type: 'circle',
    source: SITES_SOURCE_ID,
    paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            6,
            ['interpolate', ['linear'], ['get', 'flightCount'], 0, 2.5, 50, 5],
            11,
            ['interpolate', ['linear'], ['get', 'flightCount'], 0, 4.5, 50, 9],
            15,
            ['interpolate', ['linear'], ['get', 'flightCount'], 0, 7, 50, 14],
        ] as never,
        'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            ['boolean', ['feature-state', 'selected'], false],
            3,
            1.5,
        ] as never,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.92)',
        'circle-opacity': opacityByState(0.95, 0.28) as never,
        'circle-stroke-opacity': opacityByState(1, 0.28) as never,
    },
}

/**
 * Site names, above the circles.
 *
 * Only from zoom 9.5, and Mapbox drops labels that would collide, so a dense
 * valley shows the sites you can act on rather than a wall of overlapping text.
 * The font names are the two that ship with every Mapbox-hosted style.
 */
export const siteLabelLayer: LayerProps = {
    id: 'sites-label',
    type: 'symbol',
    source: SITES_SOURCE_ID,
    minzoom: 9.5,
    layout: {
        'text-field': ['get', 'name'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14] as never,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-allow-overlap': false,
    },
    paint: {
        'text-color': '#ffffff',
        // A halo rather than a background plate: it stays legible over both
        // glacier and forest without adding a shape that competes with the
        // markers.
        'text-halo-color': 'rgba(12, 16, 14, 0.85)',
        'text-halo-width': 1.4,
        'text-opacity': opacityByState(1, 0.22) as never,
    },
}
