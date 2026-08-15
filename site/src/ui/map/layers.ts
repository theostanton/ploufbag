import type { LayerProps } from 'react-map-gl/mapbox'

/**
 * Layer styling for the two shared sources.
 *
 * Everything is data-driven or feature-state-driven. Nothing here is rebuilt in
 * response to a route change: emphasis is applied with setFeatureState on
 * individual features, which the GPU handles without re-uploading the source.
 * The previous implementation added a source and a layer per flight and threw
 * them away on navigation.
 */

export const FLIGHTS_SOURCE_ID = 'flights'
export const SITES_SOURCE_ID = 'sites'

/**
 * Opacity ramp shared by the casing and the line.
 *
 * Order matters: hover beats selected beats dimmed. A dimmed track is still
 * visible -- it is context, and fading it out entirely would make a flight
 * detail view look like an empty map, which is exactly what this design is
 * trying to avoid.
 */
const opacityByState = (base: number, dimmed: number): unknown => [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    1,
    ['boolean', ['feature-state', 'selected'], false],
    1,
    ['boolean', ['feature-state', 'dim'], false],
    dimmed,
    base,
]

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
        'line-opacity': opacityByState(0.7, 0.12) as never,
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
        'line-opacity': opacityByState(0.9, 0.22) as never,
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
        'circle-opacity': opacityByState(0.95, 0.3) as never,
        'circle-stroke-opacity': opacityByState(1, 0.3) as never,
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
        'text-opacity': opacityByState(1, 0.25) as never,
    },
}
