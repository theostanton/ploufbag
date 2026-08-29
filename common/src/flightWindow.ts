import { LatLng } from './model';
import { haversineMetres } from './classify';

/**
 * Finding the flight inside a recording that also contains the ground.
 *
 * A vario or a phone gets started at the car, or in the queue for the lift, or
 * while the wing is still in the bag, and gets stopped somewhere between the
 * landing field and the bar. The pilot's fix for this is to crop the activity on
 * Strava afterwards, and most of them never bother -- so the flight arrives with
 * fifteen minutes of walking welded to each end.
 *
 * That is not only untidy. It is the difference between a flight and no flight
 * at all: three kilometres in five minutes is 42 km/h and reads as flying, and
 * the same three kilometres in forty minutes is 5 km/h and reads as a walk, so
 * the classifier rejects a perfectly ordinary sled ride on the strength of the
 * faff around it. Everything here exists to stop asking the pilot to crop.
 *
 * Pure, and separate from the classifier, because the question "when were they
 * flying?" has an answer that can be argued against a track, independently of
 * what any of it is worth as evidence.
 */

/** One point on the track, with the clock reading Strava recorded it at. */
export type TrackSample = {
    /** Seconds since the activity started. */
    timeSec: number
    point: LatLng
    /** Metres. Strava gives it for anything with a barometer or a GPS fix. */
    altitudeMetres?: number | null
}

/** The flying part of a recording, and what was cut off each end to find it. */
export type FlightWindow = {
    /** Indices into the samples that went in, inclusive. */
    startIndex: number
    endIndex: number
    /** Seconds from the start of the recording. */
    startSec: number
    endSec: number
    durationSec: number
    /** Metres along the track between those two, not as the crow flies. */
    distanceMeters: number
    /**
     * Metres climbed inside the window, or null when the track has no altitude.
     *
     * Worth having separately from Strava's figure for the whole activity: on a
     * hike and fly, theirs is mostly the walk up, and charging the flight for
     * the climb the pilot did on foot is what makes a flight look like a hike.
     */
    elevationGainMetres: number | null
    track: LatLng[]
    trimmedLeadingSec: number
    trimmedTrailingSec: number
}

/**
 * The thresholds, gathered so they can be argued about in one place.
 *
 * All of them are deliberately loose. Trimming the wrong thing loses a pilot
 * real airtime and they would have no way of knowing, so every one of these is
 * set to leave the ground in rather than risk cutting the sky out; the classifier
 * downstream copes fine with a window that is a minute too generous.
 */
export type FlightWindowOptions = {
    /**
     * Ground speed at or above which we call it flying.
     *
     * A paraglider trims at 35-40 km/h through the air, but that is not what a
     * GPS sees: soaring a ridge into 30 km/h of wind, the ground speed is
     * nearly zero, and the sink and climb rates below are what carry those
     * stretches. Set low enough to include a slow beat upwind, high enough to
     * exclude walking, which tops out around 6 km/h even downhill.
     */
    flyingSpeedKmh: number
    /**
     * Sink rate at or beyond which we call it flying, in metres per second.
     *
     * A paraglider's best case is about -1 m/s and a hurried one much more.
     * Running downhill is around -0.3 m/s and a lift is a straight line up, so
     * -0.8 leaves both of those out.
     */
    sinkRateMs: number
    /** Climb rate at or beyond which we call it flying. Thermals only. */
    climbRateMs: number
    /** Seconds either side of a sample used to smooth speed. */
    speedSmoothingSec: number
    /** Seconds either side of a sample used to smooth the vertical rate. */
    verticalSmoothingSec: number
    /**
     * How long a quiet stretch inside a flight can be before it splits it.
     *
     * Parking in a smooth thermal or hanging in the wind over a ridge can look
     * like nothing at all for a surprisingly long time, so this is generous.
     */
    gapToleranceSec: number
    /** Below this, whatever we found is not a flight and nothing is trimmed. */
    minFlightSec: number
    /**
     * The share of the recording's distance the window has to contain.
     *
     * A backstop against the whole idea going wrong on some track we have not
     * thought of: if what we picked out is a small piece of where the pilot
     * actually went, we have not found the flight, and the honest thing is to
     * decline rather than to publish a confidently wrong number.
     */
    minDistanceShare: number
}

export const DEFAULT_FLIGHT_WINDOW_OPTIONS: FlightWindowOptions = {
    flyingSpeedKmh: 12,
    sinkRateMs: -0.8,
    climbRateMs: 1.0,
    speedSmoothingSec: 6,
    verticalSmoothingSec: 10,
    gapToleranceSec: 120,
    minFlightSec: 60,
    minDistanceShare: 0.5,
}

/** Cumulative metres along the track, so any span is one subtraction. */
function cumulativeDistances(samples: TrackSample[]): number[] {
    const cumulative = new Array<number>(samples.length)
    cumulative[0] = 0
    for (let i = 1; i < samples.length; i++) {
        cumulative[i] = cumulative[i - 1] + haversineMetres(samples[i - 1].point, samples[i].point)
    }
    return cumulative
}

/**
 * The window of samples spanning at least `halfSpanSec` either side of `index`.
 *
 * Recording rates vary -- one second on a vario, ten or more on a phone that
 * decided to save battery -- so smoothing has to be defined in seconds and then
 * translated into samples, rather than assuming a fixed number of them.
 */
function spanAround(
    samples: TrackSample[],
    index: number,
    halfSpanSec: number
): { from: number; to: number } {
    let from = index
    let to = index
    while (from > 0 && samples[index].timeSec - samples[from].timeSec < halfSpanSec) {
        from--
    }
    while (to < samples.length - 1 && samples[to].timeSec - samples[index].timeSec < halfSpanSec) {
        to++
    }
    return { from, to }
}

/**
 * Whether the pilot was flying at each sample.
 *
 * Exported because it is the part worth looking at when a window comes out
 * wrong: it says, sample by sample, what the detector believed.
 */
export function airborneSamples(
    samples: TrackSample[],
    options: FlightWindowOptions = DEFAULT_FLIGHT_WINDOW_OPTIONS
): boolean[] {
    const cumulative = cumulativeDistances(samples)
    return samples.map((sample, index) => {
        const speedSpan = spanAround(samples, index, options.speedSmoothingSec)
        const seconds = samples[speedSpan.to].timeSec - samples[speedSpan.from].timeSec
        if (seconds > 0) {
            const metres = cumulative[speedSpan.to] - cumulative[speedSpan.from]
            const speedKmh = (metres / seconds) * 3.6
            if (speedKmh >= options.flyingSpeedKmh) {
                return true
            }
        }

        if (sample.altitudeMetres == null) {
            return false
        }
        const verticalSpan = spanAround(samples, index, options.verticalSmoothingSec)
        const from = samples[verticalSpan.from]
        const to = samples[verticalSpan.to]
        if (from.altitudeMetres == null || to.altitudeMetres == null) {
            return false
        }
        const verticalSeconds = to.timeSec - from.timeSec
        if (verticalSeconds <= 0) {
            return false
        }
        const rate = (to.altitudeMetres - from.altitudeMetres) / verticalSeconds
        return rate <= options.sinkRateMs || rate >= options.climbRateMs
    })
}

/** Metres climbed between two samples, null when the track has no altitude. */
function elevationGain(samples: TrackSample[], from: number, to: number): number | null {
    let gain = 0
    let known = false
    for (let i = from + 1; i <= to; i++) {
        const previous = samples[i - 1].altitudeMetres
        const current = samples[i].altitudeMetres
        if (previous == null || current == null) {
            continue
        }
        known = true
        if (current > previous) {
            gain += current - previous
        }
    }
    return known ? Math.round(gain) : null
}

/** Contiguous stretches of flying, with quiet gaps shorter than the tolerance bridged. */
function airborneRuns(
    samples: TrackSample[],
    airborne: boolean[],
    gapToleranceSec: number
): { from: number; to: number }[] {
    const runs: { from: number; to: number }[] = []
    let current: { from: number; to: number } | null = null

    for (let i = 0; i < samples.length; i++) {
        if (!airborne[i]) {
            continue
        }
        if (current && samples[i].timeSec - samples[current.to].timeSec <= gapToleranceSec) {
            current.to = i
        } else {
            current = { from: i, to: i }
            runs.push(current)
        }
    }
    return runs
}

/**
 * The flight inside a recording, or null to say "use the whole thing".
 *
 * Null is not a failure and callers must treat it as "leave it alone": a track
 * we cannot read is not evidence that the pilot did not fly, and the untrimmed
 * numbers are what we have always used.
 */
export function findFlightWindow(
    samples: TrackSample[],
    options: FlightWindowOptions = DEFAULT_FLIGHT_WINDOW_OPTIONS
): FlightWindow | null {
    if (samples.length < 4) {
        return null
    }
    const totalSec = samples[samples.length - 1].timeSec - samples[0].timeSec
    if (totalSec < options.minFlightSec) {
        return null
    }

    const airborne = airborneSamples(samples, options)
    const runs = airborneRuns(samples, airborne, options.gapToleranceSec)
    if (runs.length === 0) {
        return null
    }

    const cumulative = cumulativeDistances(samples)
    const duration = (run: { from: number; to: number }) =>
        samples[run.to].timeSec - samples[run.from].timeSec

    const longest = runs.reduce((best, run) => (duration(run) > duration(best) ? run : best))
    if (duration(longest) < options.minFlightSec) {
        return null
    }

    const totalDistance = cumulative[cumulative.length - 1]
    const windowDistance = cumulative[longest.to] - cumulative[longest.from]
    if (totalDistance > 0 && windowDistance / totalDistance < options.minDistanceShare) {
        return null
    }

    return {
        startIndex: longest.from,
        endIndex: longest.to,
        elevationGainMetres: elevationGain(samples, longest.from, longest.to),
        startSec: samples[longest.from].timeSec,
        endSec: samples[longest.to].timeSec,
        durationSec: duration(longest),
        distanceMeters: Math.round(windowDistance),
        track: samples.slice(longest.from, longest.to + 1).map(sample => sample.point),
        trimmedLeadingSec: samples[longest.from].timeSec - samples[0].timeSec,
        trimmedTrailingSec: samples[samples.length - 1].timeSec - samples[longest.to].timeSec,
    }
}

/** Total ground time a window cut off, for the line we show the pilot. */
export function trimmedSeconds(window: FlightWindow): number {
    return Math.round(window.trimmedLeadingSec + window.trimmedTrailingSec)
}
