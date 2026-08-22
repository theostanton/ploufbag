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

const FLIGHT_WORDS = [
    'vol', 'fly', 'flight', 'flying', 'para', 'glide', 'gliding', 'xc',
    'cross', 'thermal', 'soar', 'volbiv', 'biv', 'deco', 'decollage', 'atterro',
    '🪂',
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
    } else if (input.hasTrack) {
        add('no-sites', 'Not near a known site', -10)
    }

    if (!input.hasTrack) {
        // A Workout with no GPS at all could be anything, and there is nothing
        // to show the pilot to help them decide either.
        add('no-track', 'No track recorded', -30)
    }

    const hours = input.elapsedSec / 3600
    const kilometres = input.distanceMeters / 1000
    const speedKmh = hours > 0 ? kilometres / hours : 0

    if (input.elapsedSec > 0) {
        if (speedKmh >= 15 && speedKmh <= 50) {
            add('speed', `${Math.round(speedKmh)} km/h average`, 20)
        } else if (speedKmh > 0 && speedKmh < 8) {
            // Walking pace. This is the hike, not the flight.
            add('slow', `Only ${speedKmh.toFixed(1)} km/h — walking pace`, -25)
        } else if (speedKmh > 80) {
            add('fast', `${Math.round(speedKmh)} km/h — too fast`, -25)
        }
    }

    const minutes = input.elapsedSec / 60
    if (minutes < 5) {
        add('short', `Only ${Math.round(minutes)} min`, -25)
    } else if (minutes >= 8 && minutes <= 240) {
        add('duration', `${Math.round(minutes)} min`, 10)
    } else if (hours > 4) {
        add('long', `${hours.toFixed(1)} hours`, -15)
    }

    // Climb per kilometre separates flying from walking uphill. A hike-and-fly
    // recorded as one activity sits between the two, which is exactly why it
    // should land in the unsure pile rather than be guessed at.
    if (input.totalElevationGain != null && kilometres >= 1) {
        const climbPerKm = input.totalElevationGain / kilometres
        if (climbPerKm > 120) {
            add('climbing', `Climbs ${Math.round(climbPerKm)} m per km — looks like walking up`, -20)
        } else if (climbPerKm < 50) {
            add('little-climb', 'Barely climbs for the ground it covers', 10)
        }
    }

    // A flight goes somewhere. A track that ends where it started is a loop, and
    // loops are walks, rides and drives.
    if (input.startPoint && input.endPoint && input.distanceMeters > 2000) {
        const straightLine = haversineMetres(input.startPoint, input.endPoint)
        if (straightLine / input.distanceMeters < 0.05) {
            add('loop', 'Ends where it started', -15)
        }
    }

    const haystack = input.name.toLowerCase()
    const matched = FLIGHT_WORDS.find(word => haystack.includes(word))
    if (matched) {
        add('name', `Called “${input.name}”`, 20)
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
