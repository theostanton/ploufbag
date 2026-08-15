#!/usr/bin/env node
//
// Emits SQL fixtures on stdout for the local development database.
//
// Generated rather than checked in as a dump, because the full-bleed map needs
// *density* to be judged honestly: colour-by-pilot, dimming, label collision and
// camera framing all look fine with three flights and fall apart with two
// hundred. The generator is seeded, so the same fixtures come out every run and
// screenshots stay comparable across changes.
//
// Tracks are synthesised, not real GPS. They are shaped like paraglider flights
// -- climb in a drifting thermal, glide on a heading, repeat, final glide to the
// landing field -- which is what matters for judging how the tracks read on the
// map. They are not flyable and the statistics are not physically exact.
//
//   node dev/seed.mjs > seed.sql

// ---------------------------------------------------------------- randomness

// mulberry32: small, seedable, good enough for fixtures. Explicitly seeded so
// that regenerating produces byte-identical SQL.
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rng = mulberry32(20260815);

const rand = (min, max) => min + rng() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (xs) => xs[Math.floor(rng() * xs.length)];

// ------------------------------------------------------------------ geometry

const METRES_PER_DEG_LAT = 111320;
const metresPerDegLng = (lat) => METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

function offset(lat, lng, northMetres, eastMetres) {
    return [
        lat + northMetres / METRES_PER_DEG_LAT,
        lng + eastMetres / metresPerDegLng(lat),
    ];
}

function haversine([lat1, lng1], [lat2, lng2]) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

// --------------------------------------------------------------------- sites

// Real flying regions, with a handful of real site names each. Coordinates are
// approximate -- close enough that the satellite imagery under a track is the
// right mountain, which is the point.
const REGIONS = [
    {
        key: 'annecy',
        centre: [45.82, 6.23],
        takeoffs: [
            ['Col de la Forclaz', 45.8142, 6.2469, 1257],
            ['Planfait', 45.8265, 6.2078, 1250],
            ['Montmin Sud', 45.8098, 6.2531, 1310],
            ['La Tournette Ouest', 45.7938, 6.2762, 1580],
        ],
        landings: [
            ['Doussard', 45.7861, 6.2222, 460],
            ['Talloires Plage', 45.8420, 6.2160, 450],
        ],
    },
    {
        key: 'chamonix',
        centre: [45.92, 6.87],
        takeoffs: [
            ['Plan Praz', 45.9047, 6.8831, 1917],
            ["Plan de l'Aiguille", 45.9379, 6.8490, 2237],
            ['Le Brévent', 45.9331, 6.8447, 2525],
            ['Aiguillette des Houches', 45.9002, 6.8073, 2285],
        ],
        landings: [
            ['Le Savoy', 45.9278, 6.8680, 1049],
            ['Bois du Bouchet', 45.9297, 6.8764, 1042],
        ],
    },
    {
        key: 'saint-hilaire',
        centre: [45.30, 5.88],
        takeoffs: [
            ['Saint-Hilaire du Touvet', 45.3053, 5.8869, 1000],
            ['Le Cul de Chien', 45.3210, 5.8801, 1080],
            ['Dent de Crolles Sud', 45.2967, 5.8600, 1420],
        ],
        landings: [
            ['Lumbin', 45.2830, 5.9107, 230],
            ['Le Touvet', 45.3480, 5.9498, 240],
        ],
    },
    {
        key: 'verbier',
        centre: [46.09, 7.22],
        takeoffs: [
            ['La Chaux', 46.0961, 7.2286, 2260],
            ['Savoleyres', 46.1183, 7.2049, 2354],
            ['Croix de Coeur', 46.1080, 7.2360, 2174],
        ],
        landings: [
            ['Le Châble', 46.0839, 7.2136, 821],
            ['Verbier Village', 46.0993, 7.2280, 1500],
        ],
    },
    {
        key: 'gourdon',
        centre: [43.72, 6.97],
        takeoffs: [
            ['Gourdon', 43.7203, 6.9781, 758],
            ['Caussols', 43.7442, 6.9280, 1100],
            ['Col de Vence', 43.7620, 7.0450, 963],
        ],
        landings: [
            ['Le Bar-sur-Loup', 43.6950, 6.9860, 300],
            ['Bramafan', 43.7080, 6.9330, 420],
        ],
    },
    {
        key: 'dolomites',
        centre: [46.54, 11.86],
        takeoffs: [
            ['Col Rodella', 46.5045, 11.7669, 2387],
            ['Alpe di Siusi', 46.5405, 11.6410, 2050],
            ['Bruneck Kronplatz', 46.7381, 11.9540, 2275],
        ],
        landings: [
            ['Campitello', 46.4770, 11.7420, 1442],
            ['Seis am Schlern', 46.5430, 11.5620, 1000],
        ],
    },
];

// FFVL sids are text in the schema but several call sites still parseInt them
// (see Flights.getForSite). Numeric-looking ids keep those paths working.
// Starting at 1000 leaves the five fixture sites seeded by create_sites.sql
// alone -- they are useful as sites with no flights, which is exactly what the
// /sites "only with flights" filter needs to have something to filter.
let nextSid = 1000;

function slugify(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// A rough landing-field outline. sites.polygon is fetched by the site today and
// drawn nowhere; the map redesign renders it, so the fixtures need one.
function landingPolygon(lat, lng) {
    const halfWidth = rand(60, 140);
    const halfHeight = rand(50, 110);
    const rotation = rand(0, Math.PI);
    return [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
    ].map(([x, y]) => {
        const rx = x * Math.cos(rotation) - y * Math.sin(rotation);
        const ry = x * Math.sin(rotation) + y * Math.cos(rotation);
        const [plat, plng] = offset(lat, lng, ry, rx);
        return [round6(plat), round6(plng)];
    });
}

const sites = [];
for (const region of REGIONS) {
    for (const [name, lat, lng, alt] of region.takeoffs) {
        sites.push({
            ffvl_sid: String(nextSid++),
            slug: slugify(name),
            name,
            lat,
            lng,
            alt,
            type: 'Takeoff',
            region: region.key,
            polygon: null,
        });
    }
    for (const [name, lat, lng, alt] of region.landings) {
        sites.push({
            ffvl_sid: String(nextSid++),
            slug: slugify(name),
            name,
            lat,
            lng,
            alt,
            type: 'Landing',
            region: region.key,
            polygon: landingPolygon(lat, lng),
        });
    }
}

// -------------------------------------------------------------------- pilots

const PILOTS = [
    [4210001, 'Théo'],
    [4210002, 'Camille'],
    [4210003, 'Jonas'],
    [4210004, 'Marta'],
    [4210005, 'Ewan'],
    [4210006, 'Anaïs'],
];

const WINGS = [
    'Ozone Rush 6',
    'Advance Alpha 7',
    'Nova Mentor 7',
    'Gin Bonanza 3',
    'Niviuk Artik 6',
    'Ozone Delta 4',
    'Supair Leaf 3',
];

// Two or three wings each, so the per-pilot wing breakdown on /pilots/[id] has
// something to show and colour-by-pilot-and-wing produces visible variety.
const pilots = PILOTS.map(([pilot_id, first_name], i) => ({
    pilot_id,
    first_name,
    wings: [WINGS[i % WINGS.length], WINGS[(i + 3) % WINGS.length]],
    // Regions a pilot actually flies, so their tracks cluster like a real
    // pilot's rather than scattering across the Alps at random.
    regions: [REGIONS[i % REGIONS.length].key, REGIONS[(i + 2) % REGIONS.length].key],
    profile_image_url: `https://dgalywyr863hv.cloudfront.net/pictures/athletes/${pilot_id}/large.jpg`,
}));

// --------------------------------------------------------------------- track

// One flight: a sequence of drifting thermal climbs joined by glides, ending on
// a final glide into the landing field.
function generateTrack(takeoff, landing) {
    const points = [[takeoff.lat, takeoff.lng]];
    // Prevailing wind for the day, in metres per sample step.
    const windBearing = rand(0, Math.PI * 2);
    const windSpeed = rand(6, 34); // m/step, drives thermal drift
    const windNorth = Math.cos(windBearing) * windSpeed;
    const windEast = Math.sin(windBearing) * windSpeed;

    let [lat, lng] = [takeoff.lat, takeoff.lng];
    const thermalCount = randInt(2, 7);

    for (let t = 0; t < thermalCount; t++) {
        // Glide: head off on a bearing biased towards the landing, so the track
        // makes progress down the valley instead of wandering.
        const toLanding = Math.atan2(
            (landing.lng - lng) * metresPerDegLng(lat),
            (landing.lat - lat) * METRES_PER_DEG_LAT
        );
        const bearing = toLanding + rand(-1.5, 1.5);
        const glideSteps = randInt(18, 70);
        const stepMetres = rand(55, 110);
        for (let i = 0; i < glideSteps; i++) {
            // Small per-step jitter keeps the line from looking ruled.
            const wobble = rand(-0.12, 0.12);
            [lat, lng] = offset(
                lat,
                lng,
                Math.cos(bearing + wobble) * stepMetres,
                Math.sin(bearing + wobble) * stepMetres
            );
            points.push([lat, lng]);
        }

        // Climb: circles of a fairly constant radius whose centre drifts
        // downwind. This is the shape that makes a paraglider track legible at
        // a glance, so it is worth getting roughly right.
        const radius = rand(70, 260);
        const turns = rand(2.5, 9);
        const pointsPerTurn = randInt(10, 18);
        const totalCircleSteps = Math.round(turns * pointsPerTurn);
        const direction = rng() < 0.5 ? 1 : -1;
        const startAngle = rand(0, Math.PI * 2);
        // Enter the circle from where the glide left off.
        let [centreLat, centreLng] = offset(
            lat,
            lng,
            -Math.cos(startAngle) * radius,
            -Math.sin(startAngle) * radius
        );
        for (let i = 0; i < totalCircleSteps; i++) {
            const angle = startAngle + direction * ((i / pointsPerTurn) * Math.PI * 2);
            [centreLat, centreLng] = offset(
                centreLat,
                centreLng,
                windNorth / pointsPerTurn,
                windEast / pointsPerTurn
            );
            const [plat, plng] = offset(
                centreLat,
                centreLng,
                Math.cos(angle) * radius,
                Math.sin(angle) * radius
            );
            points.push([plat, plng]);
            lat = plat;
            lng = plng;
        }
    }

    // Final glide: converge on the landing field over the last stretch rather
    // than snapping to it, so the track actually arrives.
    const finalSteps = randInt(25, 60);
    for (let i = 1; i <= finalSteps; i++) {
        const k = i / finalSteps;
        const spread = (1 - k) * rand(0, 120);
        points.push([
            lat + (landing.lat - lat) * k + (rand(-1, 1) * spread) / METRES_PER_DEG_LAT,
            lng + (landing.lng - lng) * k + (rand(-1, 1) * spread) / metresPerDegLng(lat),
        ]);
    }
    points.push([landing.lat, landing.lng]);

    return points.map(([a, b]) => [round6(a), round6(b)]);
}

// -------------------------------------------------------------------- flights

const sitesByRegion = new Map();
for (const site of sites) {
    if (!sitesByRegion.has(site.region)) sitesByRegion.set(site.region, { takeoffs: [], landings: [] });
    const bucket = sitesByRegion.get(site.region);
    (site.type === 'Takeoff' ? bucket.takeoffs : bucket.landings).push(site);
}

const FLIGHT_COUNT = 165;
const flights = [];
// Spread across two seasons so the /pilots and /dashboard "recent flights"
// lists are ordered by something meaningful.
const SEASON_END = Date.UTC(2026, 7, 10, 0, 0, 0);
const SEASON_SPAN_DAYS = 620;

for (let i = 0; i < FLIGHT_COUNT; i++) {
    const pilot = pick(pilots);
    const region = pick(pilot.regions);
    const bucket = sitesByRegion.get(region);
    const takeoff = pick(bucket.takeoffs);
    const landing = pick(bucket.landings);

    const track = generateTrack(takeoff, landing);
    let distance = 0;
    for (let p = 1; p < track.length; p++) distance += haversine(track[p - 1], track[p]);

    // ~9 m/s along track is a plausible average for a mixed climb-and-glide
    // flight, with slop either side.
    const duration = Math.round((distance / rand(7.5, 11)) * rand(0.9, 1.15));

    const dayOffset = Math.floor(rand(0, SEASON_SPAN_DAYS));
    // Flying happens in the middle of the day.
    const startDate = new Date(
        SEASON_END - dayOffset * 86400000 + randInt(9, 16) * 3600000 + randInt(0, 59) * 60000
    );

    const km = (distance / 1000).toFixed(1);
    const mins = Math.round(duration / 60);
    flights.push({
        strava_activity_id: String(15000000000 + i * 7919),
        pilot_id: pilot.pilot_id,
        wing: pick(pilot.wings),
        duration_sec: duration,
        distance_meters: Math.round(distance),
        start_date: startDate.toISOString(),
        description: `${km}km in ${mins} minutes from ${takeoff.name} to ${landing.name}.`,
        polyline: track,
        takeoff_id: takeoff.ffvl_sid,
        landing_id: landing.ffvl_sid,
    });
}

flights.sort((a, b) => a.start_date.localeCompare(b.start_date));

// ----------------------------------------------------------------- emit SQL

const q = (value) => {
    if (value === null || value === undefined) return 'null';
    return `'${String(value).replace(/'/g, "''")}'`;
};
const json = (value) => (value === null ? 'null' : `${q(JSON.stringify(value))}::json`);

const out = [];
out.push('-- Generated by dev/seed.mjs. Do not edit; regenerate.');
out.push('begin;');
out.push('');
// Remove only what this script owns. The five fixture sites from
// create_sites.sql (ffvl_sid 1..5) are deliberately left in place.
out.push('delete from flights;');
out.push('delete from description_preferences;');
out.push('delete from pilots;');
out.push("delete from sites where ffvl_sid ~ '^[0-9]+$' and ffvl_sid::bigint >= 1000;");
out.push('');

for (const site of sites) {
    out.push(
        `insert into sites (ffvl_sid, slug, name, lat, lng, alt, nearest_balise_id, polygon, type) values (` +
        [
            q(site.ffvl_sid),
            q(site.slug),
            q(site.name),
            site.lat,
            site.lng,
            site.alt,
            'null',
            json(site.polygon),
            `${q(site.type)}::site_type`,
        ].join(', ') +
        ') on conflict (ffvl_sid) do nothing;'
    );
}
out.push('');

for (const pilot of pilots) {
    out.push(
        `insert into pilots (pilot_id, first_name, strava_access_token, strava_refresh_token, strava_expires_at, profile_image_url, created_at) values (` +
        [
            pilot.pilot_id,
            q(pilot.first_name),
            q('dev-access-token'),
            q('dev-refresh-token'),
            q(new Date(Date.UTC(2026, 8, 1)).toISOString()),
            q(pilot.profile_image_url),
            q(new Date(Date.UTC(2025, 2, 1)).toISOString()),
        ].join(', ') +
        ') on conflict (pilot_id) do nothing;'
    );
}
out.push('');

for (const flight of flights) {
    out.push(
        `insert into flights (strava_activity_id, pilot_id, wing, duration_sec, distance_meters, start_date, description, polyline, takeoff_id, landing_id) values (` +
        [
            q(flight.strava_activity_id),
            flight.pilot_id,
            q(flight.wing),
            flight.duration_sec,
            flight.distance_meters,
            q(flight.start_date),
            q(flight.description),
            json(flight.polyline),
            q(flight.takeoff_id),
            q(flight.landing_id),
        ].join(', ') +
        ') on conflict (strava_activity_id) do nothing;'
    );
}
out.push('');
out.push('commit;');
out.push('');

process.stdout.write(out.join('\n'));
