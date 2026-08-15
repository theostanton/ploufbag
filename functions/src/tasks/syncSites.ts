import {Either, failed, isSuccess, success, SyncSitesTask} from "@ploufbag/common";
import {Site, SiteType, Windsock, LatLng} from '@/database/model';
import {Flights} from '@/database/Flights';
import {Sites} from '@/database/Sites';
import {Windsocks} from '@/database/Windsocks';
import axios from 'axios';
import getDistance from '@turf/distance';
import {Coord, Units} from '@turf/helpers';
import {TaskResult} from "@/tasks/model";

export async function executeSyncSitesTask(
    task: SyncSitesTask
): Promise<TaskResult> {
    console.log('Executing SyncSites task');

    if (!process.env.FFVL_KEY || process.env.FFVL_KEY.length === 0) {
        return {
            success: false,
            message: 'FFVL key is not set'
        };
    }

    // Fetch and process windsocks (balises)
    const balisesResult = await getBalises();
    if (!isSuccess(balisesResult)) {
        return {
            success: false,
            message: `Failed to fetch balises: ${balisesResult[1]}`
        };
    }

    const windsocks = balisesResult[0].map((ffvlBalise: any) => convertToWindsock(ffvlBalise));

    const upsertWindsocksResult = await Windsocks.upsert(windsocks);
    if (!isSuccess(upsertWindsocksResult)) {
        return {
            success: false,
            message: `Failed to upsert windsocks: ${upsertWindsocksResult[1]}`
        };
    }

    // Fetch and process sites
    const sitesResult = await getSites();
    if (!isSuccess(sitesResult)) {
        return {
            success: false,
            message: `Failed to fetch sites: ${sitesResult[1]}`
        };
    }

    const sites = sitesResult[0].map((ffvlSite: any) => convertToSite(ffvlSite, windsocks));

    const upsertSitesResult = await Sites.upsert(sites);
    if (!isSuccess(upsertSitesResult)) {
        return {
            success: false,
            message: `Failed to upsert sites: ${upsertSitesResult[1]}`
        };
    }

    // Update existing flights with new site associations
    // Note: Using a test pilot ID - in production this might be different
    const flightsResult = await Flights.getAll(4142500);
    if (!isSuccess(flightsResult)) {
        return {
            success: false,
            message: `Failed to get flights for site association: ${flightsResult[1]}`
        };
    }

    const flights = flightsResult[0];
    for (const flight of flights) {
        // Skip flights without GPS data
        if (!flight.polyline || flight.polyline.length === 0) {
            continue;
        }

        let updated = false;

        // Update takeoff site association
        const takeoffId = await Sites.getIdOfCloset(flight.polyline[0]);
        if (takeoffId && takeoffId !== flight.takeoff_id) {
            flight.takeoff_id = takeoffId;
            updated = true;
        }

        // Update landing site association
        const landingId = await Sites.getIdOfCloset(flight.polyline[flight.polyline.length - 1]);
        if (landingId && landingId !== flight.landing_id) {
            flight.landing_id = landingId;
            updated = true;
        }

        // Save if updated
        if (updated) {
            await Flights.upsert([flight]);
        }
    }

    console.log(`Successfully synced ${sites.length} sites and ${windsocks.length} windsocks`);
    return {
        success: true,
    };
}

// FFVL API functions
async function getBalises(): Promise<Either<any[]>> {
    try {
        const response = await axios.get("https://data.ffvl.fr/api", {
            params: {
                base: "balises",
                mode: "json",
                key: process.env.FFVL_KEY
            }
        });
        return success(response.data);
    } catch (error) {
        return failed(`Failed to fetch balises: ${error}`);
    }
}

async function getSites(): Promise<Either<any[]>> {
    try {
        const response = await axios.get("https://data.ffvl.fr/api", {
            params: {
                base: "terrains",
                mode: "json",
                key: process.env.FFVL_KEY
            }
        });
        return success(response.data);
    } catch (error) {
        return failed(`Failed to fetch sites: ${error}`);
    }
}

// Utility functions for data conversion
export function convertToWindsock(ffvlBalise: any): Windsock {
    console.log(`Converting balise: ${JSON.stringify(ffvlBalise)}`);

    return {
        balise_id: ffvlBalise.idBalise,
        name: ffvlBalise.nom,
        lat: parseFloat(ffvlBalise.latitude),
        lng: parseFloat(ffvlBalise.longitude),
        alt: parseInt(ffvlBalise.altitude),
    };
}

export function convertToSite(ffvlSite: any, windsocks: Windsock[]): Site {
    console.log(`Converting site: ${JSON.stringify(ffvlSite)}`);

    let type: SiteType | null = null;
    if (ffvlSite.flying_functions_text && ffvlSite.flying_functions_text.includes("atterrissage")) {
        type = SiteType.Landing;
    }
    if (ffvlSite.flying_functions_text && ffvlSite.flying_functions_text.includes("décollage")) {
        type = SiteType.TakeOff;
    }

    const slug = slugify(ffvlSite.toponym);
    const polygon: LatLng[] | null = ffvlSite.terrain_polygon ? JSON.parse(ffvlSite.terrain_polygon) : null;

    const alt = parseInt(ffvlSite.altitude);
    const lat = parseFloat(ffvlSite.latitude);
    const lng = parseFloat(ffvlSite.longitude);

    const nearestWindsock = getNearestWindsock(lat, lng, windsocks);
    const nearest_balise_id: string | null = nearestWindsock ? nearestWindsock.balise_id : null;

    return {
        ffvl_sid: ffvlSite.suid,
        name: ffvlSite.toponym,
        lat,
        lng,
        alt,
        nearest_balise_id,
        polygon: polygon || null,
        slug,
        type
    };
}

export function getNearestWindsock(lat: number, lng: number, windsocks: Windsock[], limitMeters: number = 2000): Windsock | null {
    const from: Coord = [lat, lng];
    const options: { units: Units } = {units: "meters"};

    let closest: [Windsock, number] | null = null;

    for (const windsock of windsocks) {
        const to: Coord = [windsock.lat, windsock.lng];
        const distanceMeters = getDistance(from, to, options);

        if (distanceMeters < limitMeters && (closest === null || distanceMeters < closest[1])) {
            closest = [windsock, distanceMeters];
        }
    }

    return closest === null ? null : closest[0];
}

export function slugify(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9 ]+/g, '') // Remove all non-alphanumeric characters except spaces
        .trim()                         // Remove leading/trailing whitespace
        .replace(/\s+/g, '-')          // Replace spaces with dashes
        .toLowerCase();
}