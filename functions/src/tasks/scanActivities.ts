import {
    Activities,
    ActivityRow,
    LatLng,
    Pilots as PilotsCommon,
    Polyline,
    ScannedActivity,
    Sites,
    StravaActivityId,
    StravaAthleteId,
    classifyActivity,
    extractWingName,
    isSuccess,
    type ClassifierInput,
} from "@ploufbag/common";
import { decode } from "@googlemaps/polyline-codec";
import { StravaApi } from "@/stravaApi";
import { StravaActivitySummary } from "@/stravaApi/model";
import { shapeOfActivity } from "./flightShape";

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
    /** Activities the review pass went back to Strava for. */
    reviewed: number
    /** How many of those it changed its mind about. */
    reconsidered: number
}

/**
 * How many activities one scan will go back to Strava for.
 *
 * Two requests each at worst -- the detail, and the streams when the recording
 * looks like it has ground time in it -- against a limit counted per fifteen
 * minutes and a promotion pass that has to run afterwards out of the same
 * budget. A pilot with a long history of unread activities gets through them
 * over several scans, most recent first, which is the order they care about.
 */
const REVIEW_BUDGET = 12

/**
 * Site lookups are one database round trip each, and the scan makes two per
 * candidate activity across a pilot's whole history.
 *
 * The cache earns much less than it looks like it should: five decimal places
 * is about a metre, and two flights off the same launch are never recorded from
 * the same square metre, so in practice almost every activity misses. Widening
 * the key would trade correctness near a site boundary for hit rate, which is
 * the wrong trade -- the round trip is the thing to make cheap, and
 * add_sites_location_index.sql is what made it cheap. What the cache does still
 * pay for is the repeat within one activity, and the pilot who does record from
 * the same spot.
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
    limit: number = 10_000,
    deadline: number = Infinity
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
    const counts: ScanSummary = {
        scanned: 0, flight: 0, unsure: 0, not_flight: 0, reviewed: 0, reconsidered: 0,
    }
    // Activities of a type this pilot logs flights as. The review pass below
    // works from this list, so that reading a description is only ever spent on
    // something that could turn out to be a flight.
    const candidateIds: StravaActivityId[] = []

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
            candidateIds.push(summary.id.toString())
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

    await reviewUnreadActivities(pilotId, api, candidateIds, candidateTypes, siteCache, counts, deadline)

    console.log(`Scanned ${counts.scanned} activities for pilot ${pilotId}: ` +
        `${counts.flight} flights, ${counts.unsure} unsure, ${counts.not_flight} not flights` +
        (counts.reviewed > 0
            ? `, reviewed ${counts.reviewed} and changed our mind about ${counts.reconsidered}`
            : ''))

    return { summary: counts }
}

/**
 * Going back to Strava for the activities a summary could not settle.
 *
 * The scan above is deliberately blind to descriptions -- reading them costs a
 * request each, and the whole point of scanning from the list endpoint is that a
 * three hundred activity history costs two. But that blindness had a cost of its
 * own, and it is the bug this exists to fix: a pilot's vario uploads the
 * activity, the description with the 🪂 line lands a minute later, Strava raises
 * no webhook for it, and the flight is invisible for ever on the strength of a
 * snapshot taken before the pilot had finished.
 *
 * So anything that could still be a flight, and whose description we have never
 * read, is read once. `description_checked_at` remembers that, and an edit on
 * Strava clears it again, which is what makes this bounded rather than a
 * re-read of the pilot's whole history on every scan.
 */
async function reviewUnreadActivities(
    pilotId: StravaAthleteId,
    api: StravaApi,
    candidateIds: StravaActivityId[],
    candidateTypes: string[],
    siteCache: Map<string, NearestSite>,
    counts: ScanSummary,
    deadline: number = Infinity
): Promise<void> {
    const unread = await Activities.getUnreadCandidates(pilotId, candidateIds, REVIEW_BUDGET)
    if (!isSuccess(unread)) {
        console.log(`Activities.getUnreadCandidates failed: ${unread[1]}`)
        return
    }

    const checked: StravaActivityId[] = []
    const rescanned: ScannedActivity[] = []

    for (const activity of unread[0]) {
        // Whatever has been read so far is stored and marked below, so running
        // out of time here costs nothing but the rest of this budget: the
        // unread ones stay unread and are first in the queue next time.
        if (Date.now() > deadline) {
            console.log(`Out of time after reviewing ${checked.length}; stopping`)
            break
        }

        const detail = await api.fetchActivity(activity.strava_activity_id)
        if (!isSuccess(detail)) {
            if (detail[1] === 'Rate limited') {
                console.log(`Rate limited after reviewing ${checked.length}; stopping`)
                break
            }
            console.log(`Could not review ${activity.strava_activity_id}: ${detail[1]}`)
            continue
        }
        const stravaActivity = detail[0]

        const shape = await shapeOfActivity(api, stravaActivity)
        if (shape.rateLimited) {
            console.log(`Rate limited after reviewing ${checked.length}; stopping`)
            break
        }

        const takeoff = shape.startPoint ? await nearestSite(shape.startPoint, siteCache) : null
        const landing = shape.endPoint ? await nearestSite(shape.endPoint, siteCache) : null

        const classification = classifyActivity({
            type: stravaActivity.type,
            name: stravaActivity.name ?? '',
            distanceMeters: Math.round(stravaActivity.distance ?? 0),
            elapsedSec: stravaActivity.elapsed_time ?? 0,
            movingSec: stravaActivity.moving_time ?? null,
            totalElevationGain: stravaActivity.total_elevation_gain ?? null,
            startPoint: shape.startPoint,
            endPoint: shape.endPoint,
            hasTrack: shape.track != null,
            takeoffSiteName: takeoff?.name ?? null,
            landingSiteName: landing?.name ?? null,
            // The reason for the whole trip: this is the one field the scan
            // above cannot see.
            wingFromDescription: extractWingName(stravaActivity.description),
            flown: shape.flown,
            candidateTypes,
        })

        checked.push(activity.strava_activity_id)
        counts.reviewed++
        if (classification.verdict !== activity.verdict) {
            counts.reconsidered++
            counts[activity.verdict]--
            counts[classification.verdict]++
            console.log(
                `Reviewing ${activity.strava_activity_id} changed it from ` +
                `${activity.verdict} to ${classification.verdict}`
            )
        }

        rescanned.push(rescannedRow(activity, shape.track, classification.verdict, classification, takeoff, landing))
    }

    if (rescanned.length > 0) {
        const upserted = await Activities.upsertScanned(rescanned)
        if (!isSuccess(upserted)) {
            console.log(`Activities.upsertScanned failed for reviewed activities: ${upserted[1]}`)
            return
        }
    }

    // Marked last, and only for what actually got a verdict: an activity we
    // failed to fetch has not been read, and should be first in the queue next
    // time rather than filed as settled.
    const marked = await Activities.markDescriptionChecked(checked)
    if (!isSuccess(marked)) {
        console.log(`Activities.markDescriptionChecked failed: ${marked[1]}`)
    }
}

/**
 * The reviewed activity, as a row to store.
 *
 * Keeps Strava's own figures for the recording -- this table is the record of
 * what is on Strava, and a pilot looking at "40 min" on the activities screen
 * should see what their watch said. The trimming shows up where it belongs: in
 * the verdict, in the reasons, and in the flight the promotion pass creates.
 */
function rescannedRow(
    activity: ActivityRow,
    track: Polyline | null,
    verdict: ScannedActivity['verdict'],
    classification: { score: number; reasons: ScannedActivity['reasons'] },
    takeoff: NearestSite,
    landing: NearestSite
): ScannedActivity {
    return {
        strava_activity_id: activity.strava_activity_id,
        pilot_id: activity.pilot_id,
        type: activity.type,
        name: activity.name,
        start_date: activity.start_date,
        distance_meters: activity.distance_meters,
        elapsed_sec: activity.elapsed_sec,
        moving_sec: activity.moving_sec,
        total_elevation_gain: activity.total_elevation_gain,
        start_lat: track?.[0]?.[0] ?? activity.start_lat,
        start_lng: track?.[0]?.[1] ?? activity.start_lng,
        end_lat: track?.[track.length - 1]?.[0] ?? activity.end_lat,
        end_lng: track?.[track.length - 1]?.[1] ?? activity.end_lng,
        polyline: verdict === 'not_flight' ? null : track ?? activity.polyline,
        verdict,
        score: classification.score,
        reasons: classification.reasons,
        takeoff_id: takeoff?.ffvl_sid ?? null,
        landing_id: landing?.ffvl_sid ?? null,
    }
}
