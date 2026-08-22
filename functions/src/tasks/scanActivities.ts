import {
    Activities,
    LatLng,
    Pilots as PilotsCommon,
    Polyline,
    ScannedActivity,
    Sites,
    StravaAthleteId,
    classifyActivity,
    isSuccess,
    type ClassifierInput,
} from "@ploufbag/common";
import { decode } from "@googlemaps/polyline-codec";
import { StravaApi } from "@/stravaApi";
import { StravaActivitySummary } from "@/stravaApi/model";

/**
 * Reading a pilot's whole Strava history and deciding what each activity is.
 *
 * Creates nothing and changes no flight. It writes verdicts into `activities`
 * and stops, so that the screen which corrects a verdict can ship before the
 * automation that acts on one. See the build plan: the natural order --
 * classifier, then screens -- is the dangerous one, because a bad threshold
 * would invent flights across every pilot's account and write a stats block
 * into each of their Strava descriptions on the way.
 *
 * Everything is read from Strava's list endpoint. Two requests for a
 * three-hundred activity history, where the old importer needed three hundred.
 */

export type ScanSummary = {
    scanned: number
    flight: number
    unsure: number
    not_flight: number
}

/**
 * Site lookups are one database round trip each, and a pilot who flies from the
 * same launch every weekend asks the same question hundreds of times. Rounding
 * to five decimal places is about a metre -- finer than the GPS in a vario -- so
 * two starts from the same launch share a cache entry.
 */
type NearestSite = { ffvl_sid: string; name: string } | null

function cacheKey(point: LatLng): string {
    return `${point[0].toFixed(5)},${point[1].toFixed(5)}`
}

async function nearestSite(point: LatLng, cache: Map<string, NearestSite>): Promise<NearestSite> {
    const key = cacheKey(point)
    if (cache.has(key)) {
        return cache.get(key)!
    }
    const found = await Sites.getNearestWithin(point)
    const value: NearestSite = found ? { ffvl_sid: found.ffvl_sid, name: found.name } : null
    cache.set(key, value)
    return value
}

/** Strava sends `[]` rather than null when it has no position. */
function toLatLng(pair: [number, number] | [] | null | undefined): LatLng | null {
    if (!pair || pair.length !== 2) {
        return null
    }
    return [pair[0], pair[1]]
}

function decodeTrack(summary: StravaActivitySummary): Polyline | null {
    const encoded = summary.map?.summary_polyline
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
        console.log(`Could not decode summary_polyline for ${summary.id}: ${error}`)
        return null
    }
}

export async function scanPilotActivities(
    pilotId: StravaAthleteId,
    api: StravaApi,
    limit: number = 10_000
): Promise<{ summary?: ScanSummary; error?: string }> {
    const typesResult = await PilotsCommon.getFlightActivityTypes(pilotId)
    // Not being able to read the setting is not a reason to refuse to scan; the
    // classifier has defaults for exactly this.
    const candidateTypes = isSuccess(typesResult) ? (typesResult[0] ?? []) : []

    const summariesResult = await api.fetchActivitySummaries(limit)
    if (!isSuccess(summariesResult)) {
        return { error: `fetchActivitySummaries failed: ${summariesResult[1]}` }
    }
    const summaries = summariesResult[0]

    const siteCache = new Map<string, NearestSite>()
    const scanned: ScannedActivity[] = []
    const counts: ScanSummary = { scanned: 0, flight: 0, unsure: 0, not_flight: 0 }

    for (const summary of summaries) {
        const track = decodeTrack(summary)
        const startPoint = toLatLng(summary.start_latlng) ?? track?.[0] ?? null
        const endPoint = toLatLng(summary.end_latlng) ?? track?.[track.length - 1] ?? null

        // Sites are resolved only for activities that clear the type gate. It is
        // two database round trips each, and there is no point spending them on
        // a pilot's four hundred bike rides to tell us what the gate already
        // said.
        const isCandidate = candidateTypes.length === 0
            ? true
            : candidateTypes.includes(summary.type)

        let takeoff: NearestSite = null
        let landing: NearestSite = null
        if (isCandidate) {
            if (startPoint) takeoff = await nearestSite(startPoint, siteCache)
            if (endPoint) landing = await nearestSite(endPoint, siteCache)
        }

        const input: ClassifierInput = {
            type: summary.type,
            name: summary.name ?? '',
            distanceMeters: Math.round(summary.distance ?? 0),
            elapsedSec: summary.elapsed_time ?? 0,
            movingSec: summary.moving_time ?? null,
            totalElevationGain: summary.total_elevation_gain ?? null,
            startPoint,
            endPoint,
            hasTrack: track != null,
            takeoffSiteName: takeoff?.name ?? null,
            landingSiteName: landing?.name ?? null,
            // Never read here. The 🪂 line lives in the description, which the
            // list endpoint does not return, and going and getting it would cost
            // exactly the per-activity fetch this scan exists to avoid. The
            // importer still reads it on the path that creates flights.
            wingFromDescription: null,
            candidateTypes,
        }

        const classification = classifyActivity(input)

        scanned.push({
            strava_activity_id: summary.id.toString(),
            pilot_id: pilotId,
            type: summary.type,
            name: summary.name ?? '',
            start_date: new Date(summary.start_date),
            distance_meters: Math.round(summary.distance ?? 0),
            elapsed_sec: summary.elapsed_time ?? 0,
            moving_sec: summary.moving_time ?? null,
            total_elevation_gain: summary.total_elevation_gain ?? null,
            start_lat: startPoint?.[0] ?? null,
            start_lng: startPoint?.[1] ?? null,
            end_lat: endPoint?.[0] ?? null,
            end_lng: endPoint?.[1] ?? null,
            // Only kept where it will be looked at. Deciding "was this a flight?"
            // is a glance at the shape, and that question is never asked about
            // the eleven hundred rides we already know are not flights -- so
            // storing their geometry would be most of the table for none of the
            // value. A rejection later promoted by hand re-fetches.
            polyline: classification.verdict === 'not_flight' ? null : track,
            verdict: classification.verdict,
            score: classification.score,
            reasons: classification.reasons,
            takeoff_id: takeoff?.ffvl_sid ?? null,
            landing_id: landing?.ffvl_sid ?? null,
        })

        counts.scanned++
        counts[classification.verdict]++
    }

    const upserted = await Activities.upsertScanned(scanned)
    if (!isSuccess(upserted)) {
        return { error: `Activities.upsertScanned failed: ${upserted[1]}` }
    }

    console.log(`Scanned ${counts.scanned} activities for pilot ${pilotId}: ` +
        `${counts.flight} flights, ${counts.unsure} unsure, ${counts.not_flight} not flights`)

    return { summary: counts }
}
