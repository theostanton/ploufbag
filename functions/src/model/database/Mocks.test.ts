import {FlightRow, LatLng, PilotRowFull, Site} from "@ploufbag/common";

function randomBigInt(): number {
    return Math.floor(Math.random() * 100000);
}

function randomDistance(): number {
    return Math.floor(Math.random() * 100000)
}

function randomDuration(): number {
    return Math.floor(Math.random() * 100000)
}


export namespace Mocks {

    // A function, not a shared object literal. As a constant it evaluated
    // randomBigInt() exactly once at module load, so every flight spreading it
    // carried the *same* strava_activity_id — the flights primary key. Only one
    // mock flight ever survived the upsert, which is why the description
    // aggregates counted a single flight no matter what was seeded.
    let nextActivityId = 1
    const flightFiller = (): Pick<FlightRow, 'polyline' | 'strava_activity_id' | 'description' | 'distance_meters' | 'landing_id' | 'takeoff_id'> => ({
        strava_activity_id: `mock-activity-${nextActivityId++}`,
        description: "Some description",
        distance_meters: randomDistance(),
        landing_id: "123",
        takeoff_id: "456",
        polyline: [
            [1, 2], [3, 4]
        ]
    })

    export const userRow1: PilotRowFull = {
        pilot_id: randomBigInt(),
        first_name: "First",
        strava_access_token: "token1",
        strava_refresh_token: "refresh1",
        strava_expires_at: new Date(2050),
        profile_image_url: null,
    }
    export const userRow2: PilotRowFull = {
        pilot_id: randomBigInt(),
        first_name: "Second",
        strava_access_token: "token2",
        strava_refresh_token: "refresh2",
        strava_expires_at: new Date(2050),
        profile_image_url: null,
    }
    export const user1activity1wing1: FlightRow = {
        pilot_id: userRow1.pilot_id,
        start_date: new Date(2025, 1),
        wing: "One",
        duration_sec: 5 * 60,
        ...flightFiller(),
        strava_activity_id: "14590322465",
        description: "🪂 One",
    }
    export const user2activity1wing1: FlightRow = {
        pilot_id: userRow2.pilot_id,
        start_date: new Date(2025, 2),
        wing: "One",
        duration_sec: randomDuration(),
        ...flightFiller(),
        description: "Some description",
    }
    export const user1activity2wing2: FlightRow = {
        pilot_id: userRow1.pilot_id,
        start_date: new Date(2025, 3),
        wing: "Two",
        duration_sec: 60 * 60,
        ...flightFiller(),
        description: "Some description\n🪂 Two",
    }
    export const user1activity3wing1: FlightRow = {
        pilot_id: userRow1.pilot_id,
        start_date: new Date(2025, 4),
        wing: "One",
        duration_sec: 10 * 60,
        ...flightFiller(),
        description: "Some description\n🪂 One\nThis wing Xmin over Y flights\nThis year 1h 15min over 3 flights\nAll time 1h 15min over 3 flights\n🌐 ploufbag.com",
    }
    export const user1activity4wing1: FlightRow = {
        pilot_id: userRow1.pilot_id,
        start_date: new Date(2025, 5),
        wing: "One",
        duration_sec: 4 * 60 * 60,
        ...flightFiller()
    }
    export const user2activity2wing1: FlightRow = {
        pilot_id: userRow2.pilot_id,
        start_date: new Date(2025, 6),
        wing: "One",
        duration_sec: 4 * 60 * 60,
        ...flightFiller(),
    }

    export const home: LatLng = [45.922108, 6.876606]

    export const leBoisDuBouchet: Site = {
        ffvl_sid: "789",
        slug: 'chamonix---le-bois-du-bouchet',
        name: 'CHAMONIX - LE BOIS DU BOUCHET',
        lat: 45.92968,
        lng: 6.87636,
        alt: 1042,
        polygon: null,
        type: null,
        nearest_balise_id: null
    }

    export const leSavoy: Site = {
        ffvl_sid: "234",
        slug: 'chamonix---le-savoy',
        name: 'CHAMONIX - LE SAVOY',
        lat: 45.9278,
        lng: 6.868,
        alt: 1049,
        polygon: null,
        type: null,
        nearest_balise_id: null
    }
    export const planpraz: Site = {
        ffvl_sid: "123",
        slug: 'chamonix---plan-praz---brevent',
        name: 'CHAMONIX - PLAN PRAZ - BREVENT',
        lat: 45.9047,
        lng: 6.8831,
        alt: 1917,
        polygon: null,
        type: null,
        nearest_balise_id: null
    }

    export const forclaz: Site = {
        ffvl_sid: "456",
        slug: 'col-de-la-forclaz---montmin',
        name: 'COL DE LA FORCLAZ - MONTMIN',
        lat: 45.8142,
        lng: 6.2469,
        alt: 1257,
        polygon: null,
        type: null,
        nearest_balise_id: null
    }
}