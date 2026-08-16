/**
 * The contract between a route and the one map.
 *
 * A page does not draw on the map. It describes what the map should be showing
 * while that page is on screen, and the canvas reconciles. That keeps data
 * flowing from the server component that already fetched it, instead of a
 * route-string-to-scene switch in the shell that has to be kept in sync with
 * the router by hand.
 */

/**
 * How much of the map a route wants to leave visible.
 *
 * - `sheet`  a map view: the panel is a side rail (or a bottom sheet on a
 *            phone) and the map is the subject.
 * - `glass`  not really a map view -- sign-in, the dashboard -- but the map
 *            stays as a backdrop behind a translucent panel.
 * - `opaque` dense tabular UI (admin, styleguide) where imagery behind the
 *            content would only hurt legibility.
 */
export type ChromeMode = 'sheet' | 'glass' | 'opaque'

export type Emphasis = {
    /** strava_activity_ids to bring forward. */
    flights?: string[]
    /** ffvl_sids to bring forward. */
    sites?: string[]
    /** Push everything not named above into the background. */
    dimOthers?: boolean
}

export type Scene = {
    chrome: ChromeMode
    /** Slow bearing drift, for routes where the map is scenery rather than data. */
    ambient?: boolean
    emphasis?: Emphasis
    /**
     * Bounds the camera should frame, as [west, south, east, north]. Left unset,
     * the camera derives them from whatever `emphasis` names, and failing that
     * shows everything.
     */
    bounds?: [number, number, number, number]
    /** ffvl_sid whose polygon should be drawn. */
    focusSitePolygon?: string
}

export const DEFAULT_SCENE: Scene = { chrome: 'sheet' }

/**
 * Scenes are registered as a stack rather than a single slot because the App
 * Router keeps the outgoing page mounted for a moment while the incoming one
 * renders. With one slot, whichever component happened to unmount last would
 * win and the map would flick back to the previous view. The newest
 * registration wins instead, and an unmount removes only its own entry.
 */
export type SceneRegistration = {
    key: number
    scene: Scene
}
