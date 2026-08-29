import {
    LatLng,
    findFlightWindow,
    isSuccess,
    trimmedSeconds,
} from "@ploufbag/common";
import { decode } from "@googlemaps/polyline-codec";
import { StravaApi } from "@/stravaApi";
import { StravaActivity } from "@/stravaApi/model";

/**
 * What an activity actually was, once the ground time is taken off it.
 *
 * Both paths that create flights -- the webhook for one activity, and the
 * promotion pass over a scanned history -- need the same three things: the
 * track, the figures to classify on, and the figures to publish. Doing it here
 * once is what stops those two drifting apart, which is how the wing line came
 * to be read differently in each of them.
 */

export type FlightShape = {
    /** The flight's track, trimmed when we could work out where it began. */
    track: LatLng[] | null
    startPoint: LatLng | null
    endPoint: LatLng | null
    /** Takeoff, not "when the pilot pressed record". */
    startDate: Date
    durationSec: number
    distanceMeters: number
    /** For the classifier, and null when nothing was trimmed. */
    flown: {
        durationSec: number
        distanceMeters: number
        totalElevationGain?: number | null
        trimmedSec: number
    } | null
    /** Strava told us to stop asking. Callers running a batch should. */
    rateLimited: boolean
}

/** Seconds of stopped time we will ignore rather than pay a request to explain. */
const TIDY_STOPPED_SEC = 60
/** Below this average speed, a recording has something other than flying in it. */
const TIDY_SPEED_KMH = 20
/** A trim smaller than this is not worth preferring our arithmetic to Strava's. */
const WORTH_TRIMMING_SEC = 30

/**
 * Whether it is worth a third Strava request to find the flight inside this.
 *
 * A recording that never stopped and averages flying speed is already the
 * flight, and asking for its timestamps would buy nothing. Anything else --
 * stopped time on the clock, or an average that includes walking -- has ground
 * in it, and that is the case worth paying for.
 */
export function looksPadded(activity: StravaActivity): boolean {
    const elapsed = activity.elapsed_time ?? 0
    if (elapsed <= 0) {
        return false
    }
    const moving = activity.moving_time ?? elapsed
    if (elapsed - moving >= TIDY_STOPPED_SEC) {
        return true
    }
    const speedKmh = ((activity.distance ?? 0) / 1000) / (elapsed / 3600)
    return speedKmh < TIDY_SPEED_KMH
}

function decodeTrack(encoded: string | undefined): LatLng[] | null {
    if (!encoded) {
        return null
    }
    try {
        const tuples = decode(encoded)
        if (tuples.length < 2) {
            return null
        }
        return tuples.map(tuple => [tuple[0], tuple[1]] as LatLng)
    } catch (error) {
        console.log(`Could not decode polyline: ${error}`)
        return null
    }
}

/**
 * The flight inside an activity.
 *
 * Never fails: an activity we cannot get streams for, or whose track we cannot
 * read, comes back as itself with `flown` null, which is exactly what every
 * caller did before any of this existed.
 */
export async function shapeOfActivity(
    api: StravaApi,
    activity: StravaActivity
): Promise<FlightShape> {
    const track = decodeTrack(activity.map?.polyline || activity.map?.summary_polyline)

    const untrimmed: FlightShape = {
        track,
        startPoint: track?.[0] ?? null,
        endPoint: track ? track[track.length - 1] : null,
        startDate: new Date(activity.start_date),
        durationSec: activity.elapsed_time ?? 0,
        distanceMeters: Math.round(activity.distance ?? 0),
        flown: null,
        rateLimited: false,
    }

    if (!track || !looksPadded(activity)) {
        return untrimmed
    }

    const streams = await api.fetchActivityStreams(activity.id)
    if (!isSuccess(streams)) {
        // A flight we could not measure precisely is still a flight. The only
        // answer worth passing up the chain is the rate limit, because a batch
        // should stop rather than spend the rest of its requests failing.
        console.log(`No streams for ${activity.id}: ${streams[1]}`)
        return { ...untrimmed, rateLimited: streams[1] === 'Rate limited' }
    }

    const window = findFlightWindow(streams[0])
    if (!window || trimmedSeconds(window) < WORTH_TRIMMING_SEC) {
        return untrimmed
    }

    const startDate = new Date(untrimmed.startDate.getTime() + window.startSec * 1000)

    console.log(
        `Trimmed ${trimmedSeconds(window)}s of ground time off ${activity.id}: ` +
        `${untrimmed.durationSec}s recorded, ${window.durationSec}s flown`
    )

    return {
        track: window.track,
        startPoint: window.track[0] ?? null,
        endPoint: window.track[window.track.length - 1] ?? null,
        startDate,
        durationSec: window.durationSec,
        distanceMeters: window.distanceMeters,
        flown: {
            durationSec: window.durationSec,
            distanceMeters: window.distanceMeters,
            totalElevationGain: window.elevationGainMetres,
            trimmedSec: trimmedSeconds(window),
        },
        rateLimited: false,
    }
}
