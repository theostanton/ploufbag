import { LatLng } from './model';

/**
 * Deciding whether a Strava activity was a paragliding flight.
 *
 * Everything here is computed from the summary Strava's *list* endpoint already
 * returns, which is what makes a whole history scannable in two requests rather
 * than one per activity. The old importer needed the description -- available
 * only from the detail endpoint, one activity at a time -- because it required
 * the pilot to have typed the wing in by hand.
 *
 * Pure, and deliberately so. This is the piece whose thresholds will be argued
 * about and moved, and it has to be arguable against a table of cases rather
 * than against a database.
 */

export type ActivityVerdict = 'flight' | 'unsure' | 'not_flight'

/**
 * One signal, and what it contributed.
 *
 * `text` is written for the pilot, not for a log: a pilot cannot act on "87%
 * confident" but recognises "Planfait → Doussard" instantly, because they were
 * there. Positive points argue for a flight, negative against.
 */
export type ClassificationReason = {
    code: string
    text: string
    points: number
}

export type ClassifierInput = {
    /** Strava's activity type, e.g. `Workout`. */
    type: string
    name: string
    distanceMeters: number
    elapsedSec: number
    movingSec?: number | null
    /** Strava's cumulative climb, in metres. */
    totalElevationGain?: number | null
    startPoint?: LatLng | null
    endPoint?: LatLng | null
    /** Whether Strava recorded a track at all. */
    hasTrack: boolean
    /** Names of the FFVL sites the track starts and ends at, when it does. */
    takeoffSiteName?: string | null
    landingSiteName?: string | null
    /** A wing read off the old 🪂 description line, when we happen to have it. */
    wingFromDescription?: string | null
    /**
     * The flight itself, once the ground time at each end is trimmed off.
     *
     * Present only where we have been to Strava for the track's timestamps, so
     * everything below has to read the same with it absent -- the history scan
     * works from summaries alone and never has it.
     *
     * Where it is present it replaces the figures above rather than adding to
     * them, because a recording that starts in the lift queue and ends at the
     * bar describes a walk however the flight in the middle of it went. See
     * flightWindow.ts.
     */
    flown?: {
        durationSec: number
        distanceMeters: number
        /** Metres climbed while flying. Not Strava's figure for the whole day. */
        totalElevationGain?: number | null
        /** Ground time cut off both ends together. */
        trimmedSec: number
    } | null
    /**
     * The Strava activity types this pilot logs flights as. Empty means "not
     * asked yet", and the defaults below apply.
     */
    candidateTypes?: string[]
}

export type Classification = {
    verdict: ActivityVerdict
    score: number
    reasons: ClassificationReason[]
}

/**
 * What we assume a pilot logs flights as until they tell us otherwise.
 *
 * Strava has no paragliding type, so pilots pick something adjacent. These two
 * were hard-coded in the importer; here they are only a default, and the empty
 * state asks when they turn out to be wrong.
 */
export const DEFAULT_FLIGHT_ACTIVITY_TYPES = ['Workout', 'Kitesurf']

/** At or above this, we act without asking. */
export const CONFIDENT_SCORE = 60
/** At or above this, we ask. Below it, we assume not and remember the answer. */
export const UNSURE_SCORE = 20

/**
 * Words that only appear in the name of a paragliding flight.
 *
 * Weighted near-decisively, because they are: nobody titles a bike ride
 * "Paraglide". Real accounts turn out to lean on this far harder than any
 * geometry — a pilot who names their activities at all usually names them after
 * the sport or the site.
 */
const PARAGLIDING_WORDS = [
    'paraglide', 'paragliding', 'parapente', 'speedfly', 'speedriding',
    'hike and fly', 'hike-and-fly', 'vol libre', 'volbiv', '🪂',
]

/** Words that suggest a flight without settling it. */
const FLIGHT_WORDS = [
    'vol', 'fly', 'flight', 'flying', 'glide', 'gliding', 'xc',
    'cross', 'thermal', 'soar', 'biv', 'deco', 'decollage', 'atterro',
]

/**
 * The wing named on the old 🪂 description line, if there is one.
 *
 * This convention is no longer the only way in -- that was the whole problem --
 * but it is still the strongest signal there is, because the pilot wrote it
 * themselves. A pilot who has been typing it for years should find it still
 * being read.
 *
 * The pattern also has to skip past the aggregate columns *we* publish on that
 * same line ("🪂 Zeno 2    15 flights / 18h 45min"), or re-importing an activity
 * we have already written to would read the wing as its own statistics.
 */
export function extractWingName(description: string | null | undefined): string | null {
    if (!description) {
        return null
    }
    const named = description
        .split('\n')
        .map(line => line.match(/^🪂 (.+?)(?:\s{2,}\d|\s+\d+ flights?|$)/))
        .filter(match => match != null)
        .map(match => match!![1].trim())
        .filter(name => name.length > 0)

    return named[0] ?? null
}

/**
 * The longest wing name we will store.
 *
 * A cap rather than a rejection, and the distinction matters: the backfill pass
 * selects its work with a SQL predicate and this function decides what to do
 * with it, so anything this refuses is a row the query keeps offering and the
 * pass keeps declining -- the treadmill #44 was about. Truncating always makes
 * progress. Sixty characters is longer than "Ozone Zeno 2 (the small one)" and
 * far shorter than a paragraph pasted onto the line by accident.
 */
const MAX_WING_NAME_LENGTH = 60

/**
 * A wing name fit to store, or nothing.
 *
 * Internal whitespace is collapsed, not merely trimmed, for the same reason
 * wing_key() folds it: "Zeno 2", "Zeno  2" and "Zeno 2 " are one glider, and the
 * display name should agree with the key that decides identity rather than
 * preserving whichever spacing happened to survive a padded stats column. That
 * padding is not hypothetical -- production carries flights whose wing reads
 * "ronin      ", captured verbatim from an aggregate line, which the map then
 * draws in a different colour from "ronin" because the colour is a hash of the
 * raw string.
 */
export function normaliseWingName(raw: string | null | undefined): string | null {
    if (!raw) {
        return null
    }
    const collapsed = raw.replace(/\s+/g, ' ').trim()
    if (collapsed.length === 0) {
        return null
    }
    const capped = collapsed.slice(0, MAX_WING_NAME_LENGTH)
    // Slicing by code unit can cut a surrogate pair in half, and half a pair is
    // an invalid string that Postgres will reject rather than store. Emoji in a
    // wing name are rare; a failed write on one is not worth the risk.
    return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped
}

/**
 * The wing a description names, ready to be looked up or created.
 *
 * extractWingName reads the line; this decides whether what it read is a name we
 * are willing to write into the wings table. Callers that are about to create a
 * row should use this one, so that the name stored, the name published back to
 * Strava and the key the unique index is built over all agree.
 */
export function wingNameFromDescription(description: string | null | undefined): string | null {
    return normaliseWingName(extractWingName(description))
}

/** Metres between two points, good enough for "did this end where it started". */
export function haversineMetres(a: LatLng, b: LatLng): number {
    const R = 6_371_000
    const toRad = (degrees: number) => (degrees * Math.PI) / 180
    const dLat = toRad(b[0] - a[0])
    const dLng = toRad(b[1] - a[1])
    const lat1 = toRad(a[0])
    const lat2 = toRad(b[0])
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function classifyActivity(input: ClassifierInput): Classification {
    const reasons: ClassificationReason[] = []
    const add = (code: string, text: string, points: number) =>
        reasons.push({ code, text, points })

    const candidateTypes = input.candidateTypes?.length
        ? input.candidateTypes
        : DEFAULT_FLIGHT_ACTIVITY_TYPES

    // The gate. An activity of a type this pilot never logs flights as is not a
    // flight, and is recorded as such rather than dropped -- the empty state
    // needs to be able to say "you have 340 Hikes, is that where they are?".
    if (!candidateTypes.includes(input.type)) {
        return {
            verdict: 'not_flight',
            score: 0,
            reasons: [{
                code: 'type',
                text: `Logged as ${input.type}`,
                points: 0,
            }],
        }
    }

    // Decisive. The pilot wrote the wing on it themselves under the old
    // convention, which is a stronger statement than any geometry.
    if (input.wingFromDescription) {
        add('wing-line', `You wrote 🪂 ${input.wingFromDescription} on it`, 100)
    }

    const hasTakeoff = Boolean(input.takeoffSiteName)
    const hasLanding = Boolean(input.landingSiteName)

    if (hasTakeoff && hasLanding) {
        // Together these are as close to proof as this gets. Almost nothing else
        // on Strava starts inside a marked launch and ends at a marked landing.
        add('sites', `${input.takeoffSiteName} → ${input.landingSiteName}`, 85)
    } else if (hasTakeoff) {
        add('takeoff', `Started at ${input.takeoffSiteName}`, 40)
        // Half the evidence is half the evidence. An outlanding is ordinary, so
        // this is a doubt rather than a disqualification -- a flight moving at
        // flying speed still clears the bar on the strength of everything else.
        // It is also the doubt worth showing the pilot, because it is the thing
        // they can settle in a glance at the track.
        if (input.hasTrack) {
            add('open-landing', 'Landed away from any known site', -15)
        }
    } else if (hasLanding) {
        add('landing', `Landed at ${input.landingSiteName}`, 30)
        if (input.hasTrack) {
            add('open-takeoff', 'Did not start at a known launch', -15)
        }
    }
    // No penalty for matching no site at all. The site table is the French
    // federation's, so a pilot flying anywhere else matches nothing however
    // obvious their flight is — and the scoring has to be reachable without it.
    // Silence here, rather than evidence against.

    if (!input.hasTrack) {
        // A Workout with no GPS at all could be anything, and there is nothing
        // to show the pilot to help them decide either.
        add('no-track', 'No track recorded', -30)
    }

    // Everything below measures the flight rather than the recording. Where the
    // track's timestamps told us when the pilot was actually airborne, those
    // figures stand in for Strava's -- which is what stops a sled ride with a
    // walk welded to each end reading as a walk. See `flown` above.
    const elapsedSec = input.flown?.durationSec ?? input.elapsedSec
    const distanceMeters = input.flown?.distanceMeters ?? input.distanceMeters
    const elevationGain = input.flown
        ? input.flown.totalElevationGain ?? null
        : input.totalElevationGain ?? null

    if (input.flown && input.flown.trimmedSec >= 60) {
        // Worth no points on purpose. The trim is not evidence for a flight, it
        // is the reason the evidence below reads the way it does -- and a pilot
        // looking at a forty minute activity we call a six minute flight is owed
        // the sentence that explains it.
        add(
            'trimmed',
            `Ignored ${Math.round(input.flown.trimmedSec / 60)} min on the ground`,
            0
        )
    }

    const hours = elapsedSec / 3600
    const kilometres = distanceMeters / 1000
    const speedKmh = hours > 0 ? kilometres / hours : 0

    if (elapsedSec > 0) {
        if (speedKmh >= 15 && speedKmh <= 50) {
            add('speed', `${Math.round(speedKmh)} km/h average`, 20)
        } else if (speedKmh > 0 && speedKmh < 8) {
            // Walking pace. This is the hike, not the flight.
            add('slow', `Only ${speedKmh.toFixed(1)} km/h — walking pace`, -25)
        } else if (speedKmh > 80) {
            add('fast', `${Math.round(speedKmh)} km/h — too fast`, -25)
        }
    }

    const minutes = elapsedSec / 60
    // The floor used to be five minutes, and the bonus started at eight. Both
    // were wrong: measured against a real account, a large share of flights are
    // sled rides of three to eleven minutes off a lift-served launch, and the
    // old bands rejected them outright. Only a genuine false start is short
    // enough to count against.
    if (minutes < 3) {
        add('short', `Only ${Math.round(minutes)} min`, -25)
    } else if (minutes <= 240) {
        add('duration', `${Math.round(minutes)} min`, 10)
    } else if (hours > 4) {
        add('long', `${hours.toFixed(1)} hours`, -15)
    }

    // Walking pace, and only walking pace, is what makes climbing and looping
    // suspicious. Both penalties are gated on it, because on their own they
    // describe ordinary flying: a paraglider climbs — that is the entire sport —
    // and ridge and dune soaring lands you exactly where you took off. Measured
    // against a real account, ungated versions of these two rejected genuine
    // thermic and coastal flights.
    const looksLikeWalking = elapsedSec > 0 && speedKmh > 0 && speedKmh < 15

    if (looksLikeWalking && elevationGain != null && kilometres >= 1) {
        const climbPerKm = elevationGain / kilometres
        if (climbPerKm > 120) {
            add('climbing', `Climbs ${Math.round(climbPerKm)} m per km at walking pace`, -20)
        }
    }
    if (elevationGain != null && kilometres >= 1) {
        const climbPerKm = elevationGain / kilometres
        if (climbPerKm < 50) {
            add('little-climb', 'Barely climbs for the ground it covers', 10)
        }
    }

    if (looksLikeWalking && input.startPoint && input.endPoint && distanceMeters > 2000) {
        const straightLine = haversineMetres(input.startPoint, input.endPoint)
        if (straightLine / distanceMeters < 0.05) {
            add('loop', 'Ends where it started, at walking pace', -15)
        }
    }

    const haystack = input.name.toLowerCase()
    if (PARAGLIDING_WORDS.some(word => haystack.includes(word))) {
        add('name', `Called “${input.name}”`, 45)
    } else if (FLIGHT_WORDS.some(word => haystack.includes(word))) {
        add('name', `Called “${input.name}”`, 15)
    }

    const score = reasons.reduce((total, reason) => total + reason.points, 0)

    const verdict: ActivityVerdict =
        score >= CONFIDENT_SCORE ? 'flight' : score >= UNSURE_SCORE ? 'unsure' : 'not_flight'

    return { verdict, score, reasons: rankReasons(reasons) }
}

/**
 * Strongest signals first, so a UI showing only the first two or three shows the
 * ones that actually decided it.
 */
function rankReasons(reasons: ClassificationReason[]): ClassificationReason[] {
    return [...reasons].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
}

/** The verdict that counts: what the pilot said, or failing that, what we think. */
export function effectiveVerdict(
    verdict: ActivityVerdict,
    pilotVerdict: ActivityVerdict | null | undefined
): ActivityVerdict {
    return pilotVerdict ?? verdict
}
