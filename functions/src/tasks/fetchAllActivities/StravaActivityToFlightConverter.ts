import {StravaActivity, StravaAthleteId} from "@/stravaApi/model";
import {FlightRow, LatLng, Polyline, isSuccess, Either, Sites, failure, isFailure, success} from "@ploufbag/common";
import {decode, LatLngTuple} from "@googlemaps/polyline-codec";

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type FlightRowInitial = Optional<FlightRow, 'polyline'>
type FlightRowGeoData = Pick<FlightRow, 'polyline'>
type FlightRowSiteIds = Pick<FlightRow, 'takeoff_id' | 'landing_id'>

export class StravaActivityToFlightConverter {
    static async convert(pilotId: StravaAthleteId, stravaActivity: StravaActivity): Promise<Either<FlightRow>> {

        const matches = stravaActivity.description
            .split("\n")
            .map((line) => line.match(/^🪂 (.+?)(?:\s{2,}\d|\s+\d+ flights?|$)/))
            .filter(match => match != null)
            .map((match) => match!![1].trim())

        if (matches.length == 0) {
            return failure(`Couldn't extract wing from description=${stravaActivity.description}`)
        }

        const wing = matches[0]

        const initial: FlightRowInitial = {
            pilot_id: parseInt(pilotId.toString()),
            strava_activity_id: stravaActivity.id.toString(),
            distance_meters: stravaActivity.distance,
            duration_sec: stravaActivity.elapsed_time,
            wing: wing,
            start_date: new Date(stravaActivity.start_date),
            description: stravaActivity.description,
            landing_id: undefined,
            takeoff_id: undefined
        }

        const geoResult = extractGeoData(stravaActivity)

        if (isFailure(geoResult)) {
            return failure(`Couldn't extractGeoData error=${geoResult[1]}`)
        }

        const takeoffLandingIds = await associateSiteIds(geoResult[0].polyline)

        const value: FlightRow = {
            ...initial,
            ...geoResult[0],
            ...takeoffLandingIds
        }

        return success(value)

    }

}

export async function associateSiteIds(polyline: Polyline): Promise<FlightRowSiteIds> {

    const takeoffPoint = polyline[0]
    const landingPoint = polyline[polyline.length - 1]

    const takeoff_slug: string | null = await Sites.getIdOfCloset(takeoffPoint)
    const landing_slug: string | null = await Sites.getIdOfCloset(landingPoint)

    return {
        takeoff_id: takeoff_slug ? takeoff_slug : undefined,
        landing_id: landing_slug ? landing_slug : undefined,
    }


}

export function extractGeoData(stravaActivity: StravaActivity): Either<FlightRowGeoData> {
    const tuples: LatLngTuple[] = decode(stravaActivity.map.polyline)

    if (tuples.length < 2) {
        return failure(`Not enough points on polyline=${JSON.stringify(stravaActivity.map.polyline)} tuples=${JSON.stringify(tuples)}`)
    }

    const polyline: LatLng[] = tuples.map(tuple => {
        const latLng: LatLng = [tuple[0], tuple[1]]
        return latLng
    })

    return success({polyline})
}