import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'ts-postgres';
import { TestDatabaseSetup } from '../../test/setup';
import { Sites } from './Sites';

let testClient: Client;

async function insertSite(ffvlSid: string, type: 'Takeoff' | 'Landing' | null) {
  await testClient.query(
    `INSERT INTO sites (ffvl_sid, slug, name, lat, lng, alt, type)
     VALUES ($1, $1, $1, 45.9, 6.1, 1000, $2::text::site_type)`,
    [ffvlSid, type]
  );
}

let flightId = 0;
async function insertFlight(takeoffId: string | null, landingId: string | null) {
  flightId += 1;
  await testClient.query(
    `INSERT INTO flights (strava_activity_id, pilot_id, wing, duration_sec, distance_meters, start_date,
                          description, takeoff_id, landing_id)
     VALUES ($1, 1, 'wing', 600, 1000, now(), '', $2, $3)`,
    [String(flightId), takeoffId, landingId]
  );
}

describe('Sites.getAllWithFlightCounts', () => {
  beforeAll(async () => {
    const setup = await TestDatabaseSetup.createTestDatabase();
    testClient = setup.client;
  });

  afterAll(async () => {
    await TestDatabaseSetup.cleanup();
  });

  beforeEach(async () => {
    // create_sites.sql seeds a handful of fixture sites; start from none.
    await testClient.query('TRUNCATE flights, sites');
  });

  it('returns takeoff and landing counts alongside the combined count', async () => {
    await insertSite('both', null);
    await insertSite('takeoff-only', null);
    await insertSite('landing-only', null);
    await insertSite('unflown', null);

    await insertFlight('both', 'both');
    await insertFlight('both', 'landing-only');
    await insertFlight('takeoff-only', 'both');
    await insertFlight('takeoff-only', 'landing-only');
    await insertFlight('takeoff-only', null);

    const [sites, errorMessage] = await Sites.getAllWithFlightCounts();
    expect(errorMessage).toBeUndefined();

    const counts = Object.fromEntries(sites!.map(site => [
      site.ffvl_sid,
      { takeoffCount: site.takeoffCount, landingCount: site.landingCount, flightCount: site.flightCount },
    ]));
    expect(counts).toEqual({
      'both': { takeoffCount: 2, landingCount: 2, flightCount: 4 },
      'takeoff-only': { takeoffCount: 3, landingCount: 0, flightCount: 3 },
      'landing-only': { takeoffCount: 0, landingCount: 2, flightCount: 2 },
      'unflown': { takeoffCount: 0, landingCount: 0, flightCount: 0 },
    });
  });

  it('gives the same split as the map query, so list and map colours agree', async () => {
    await insertSite('a', 'Takeoff');
    await insertSite('b', null);
    await insertFlight('b', 'a');
    await insertFlight('a', 'b');
    await insertFlight('a', 'a');

    const [list] = await Sites.getAllWithFlightCounts();
    const [map] = await Sites.getAllForMap();

    const split = (site: { ffvl_sid: string, takeoffCount: number, landingCount: number }) =>
      [site.ffvl_sid, site.takeoffCount, site.landingCount];
    expect(list!.map(split).sort()).toEqual(map!.map(split).sort());
  });
});
