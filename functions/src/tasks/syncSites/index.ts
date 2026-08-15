import {TaskBody, TaskResult} from "@/tasks/model";
import axios from "axios";
import {LatLng, Site, SiteType, Windsock, isSuccess, isFailure} from "@ploufbag/common";
import {Sites} from "@ploufbag/common";
import {Windsocks} from "@ploufbag/common";

import getDistance from "@turf/distance"
import {Coord, Units} from "@turf/helpers"
import {Flights} from "@ploufbag/common";
import {FfvlBalise, FfvlSite} from "@/ffvlApi/model";

export type SyncSitesTask = {
    name: "SyncSites";
}

export function isSyncSitesTask(body: TaskBody): body is SyncSitesTask {
    return (body as SyncSitesTask).name !== undefined;
}

export function slugify(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9 ]+/g, '') // Remove all non-alphanumeric characters except spaces
        .trim()                         // Remove leading/trailing whitespace
        .replace(/\s+/g, '-')          // Replace spaces with dashes
        .toLowerCase()
}

export function convertToWindsock(ffvlBalise: FfvlBalise): Windsock {
    console.log(`convertToWindsock ${JSON.stringify(ffvlBalise)}`);

    return {
        balise_id: ffvlBalise.idBalise,
        name: ffvlBalise.nom,
        lat: parseFloat(ffvlBalise.latitude),
        lng: parseFloat(ffvlBalise.longitude),
        alt: parseInt(ffvlBalise.altitude),
    }
}

export function getNearestWindsock(lat: number, lng: number, windsocks: Windsock[], limitMeters: number = 2000): Windsock | null {
    const from: Coord = [lat, lng]
    const options: { units: Units } = {units: "meters"}

    let closest: [Windsock, number] | null = null

    for (const windsock of windsocks) {

        const to: Coord = [windsock.lat, windsock.lng]
        const distanceMeters = getDistance(from, to, options)

        if (distanceMeters < limitMeters && (closest == null || distanceMeters < closest[1])) {
            closest = [windsock, distanceMeters]
        }
    }
    return closest == null ? null : closest[0]
}

export function convertToSite(ffvlSite: FfvlSite, windsocks: Windsock[]): Site {
    console.log(`convertToSite ${JSON.stringify(ffvlSite)}`);
    let type: SiteType | null = null
    if (ffvlSite.flying_functions_text && ffvlSite.flying_functions_text.includes("atterrissage")) {
        type = SiteType.Landing
    }
    if (ffvlSite.flying_functions_text && ffvlSite.flying_functions_text.includes("décollage")) {
        type = SiteType.TakeOff
    }


    const slug = slugify(ffvlSite.toponym)

    const polygon: LatLng[] | null = ffvlSite.terrain_polygon ? JSON.parse(ffvlSite.terrain_polygon) : null

    const alt = parseInt(ffvlSite.altitude)
    const lat = parseFloat(ffvlSite.latitude)
    const lng = parseFloat(ffvlSite.longitude)

    const nearestWindsock = getNearestWindsock(lat, lng, windsocks)
    const nearest_balise_id: string | null = nearestWindsock ? nearestWindsock.balise_id : null

    return {
        ffvl_sid: ffvlSite.suid,
        name: ffvlSite.toponym,
        lat,
        lng,
        alt,
        nearest_balise_id,
        polygon,
        slug,
        type
    }
}

export default async function (task: TaskBody): Promise<TaskResult> {
    if (!isSyncSitesTask(task)) {
        return {
            success: false,
            message: `Is not a valid SyncSitesTask task=${JSON.stringify(task)}`
        }
    }

    if (!process.env.FFVL_KEY || process.env.FFVL_KEY.length == 0) {
        return {
            success: false,
            message: `ffvl key is not set`
        }
    }

    const ffvlBalisesResult = await axios.get<FfvlBalise[]>("https://data.ffvl.fr/api", {
        params: {
            base: "balises",
            mode: "json",
            key: process.env.FFVL_KEY
        }
    })

    const windsocks = ffvlBalisesResult.data.map(ffvlBalise => convertToWindsock(ffvlBalise))

    const upsertWindsocksResult = await Windsocks.upsert(windsocks)

    if (isFailure(upsertWindsocksResult)) {
        return {
            success: false,
            message: `Failed to upsert windsocks=${upsertWindsocksResult[1]}`
        }
    }

    const ffvlSitesResult = await axios.get<FfvlSite[]>("https://data.ffvl.fr/api", {
        params: {
            base: "terrains",
            mode: "json",
            key: process.env.FFVL_KEY
        }
    })

    const sites = ffvlSitesResult.data.map(ffvlSite => convertToSite(ffvlSite, windsocks))

    const upsertResult = await Sites.upsert(sites)

    // if (!isSuccess(upsertResult)) {
    //     return {
    //         success: false,
    //         message: `Faield to upsert sites error=${upsertResult.error}`
    //     }
    // }

    const flightsResult = await Flights.getAll(4142500)
    if (isFailure(flightsResult)) {
        return {
            success: false,
            message: `Failed to update flights error=${flightsResult[1]}`
        }
    }

    for await (const flight of flightsResult[0]) {
        // Skip flights without GPS data
        if (!flight.polyline || flight.polyline.length === 0) {
            continue
        }

        const takeoffId = await Sites.getIdOfCloset(flight.polyline[0])
        if (takeoffId) {
            flight.takeoff_id = takeoffId
        }
        const landingId = await Sites.getIdOfCloset(flight.polyline[flight.polyline.length - 1])
        if (landingId) {
            flight.landing_id = landingId
        }
        await Flights.upsert([flight])
    }

    return {
        success: true,
    }
}