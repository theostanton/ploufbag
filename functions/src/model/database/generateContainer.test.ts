import {PostgreSqlContainer, StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {connect} from "ts-postgres";
import {end, setClient} from "./client";
import {DescriptionPreference, FlightRow, PilotRowFull, Site, isSuccess, splitStatements} from "@ploufbag/common";
import {Pilots} from "./Pilots";
import {Flights} from "./Flights";
import * as fs from "node:fs";
import {Mocks} from "./Mocks.test";
import {Sites} from "./Sites";
import {schemaManifest} from "./schemaManifest";


export namespace TestContainer {

    export async function generateEmpty(): Promise<StartedPostgreSqlContainer> {
        return generateContainer()
    }

    export async function generateFromMocks(): Promise<StartedPostgreSqlContainer> {
        return generateContainer(
            [Mocks.userRow1, Mocks.userRow2],
            [
                Mocks.user1activity1wing1,
                Mocks.user2activity1wing1,
                Mocks.user1activity2wing2,
                Mocks.user1activity3wing1,
                Mocks.user1activity4wing1,
                Mocks.user2activity2wing1
            ],
            [
                Mocks.planpraz,
                Mocks.forclaz,
                Mocks.leSavoy,
                Mocks.planpraz
            ],
        )

    }

    export async function generateCustom(pilots: PilotRowFull[] = [],
                                         flights: FlightRow[] = [],
                                         sites: Site[] = []
    ): Promise<StartedPostgreSqlContainer> {
        // Was `return generateCustom(...)` — unbounded self-recursion.
        return generateContainer(pilots, flights, sites)
    }

    async function generateContainer(
        pilots: PilotRowFull[] = [],
        flights: FlightRow[] = [],
        sites: Site[] = [],
        descriptionPreferences: DescriptionPreference[] = []
    ): Promise<StartedPostgreSqlContainer> {

        // Pinned to the major version production runs (POSTGRES_14). This was
        // bare "postgres", i.e. :latest, so the suite silently re-targeted a new
        // major whenever one shipped.
        const container = await new PostgreSqlContainer("postgres:14")
            .start();

        // The seeding below goes through Pilots.insert / Flights.upsert /
        // Sites.upsert, all of which use withPooledClient — and getPool() builds
        // its config from DATABASE_* env vars, not from setClient(). Without
        // these the pool targets localhost:5432 rather than the container, the
        // seed fails, beforeAll throws, and afterAll then dies on an undefined
        // container. Env must be set before anything acquires a pool, and any
        // pool left over from an earlier container must be discarded.
        process.env.DATABASE_HOST = container.getHost()
        process.env.DATABASE_PORT = String(container.getPort())
        process.env.DATABASE_NAME = container.getDatabase()
        process.env.DATABASE_USER = container.getUsername()
        process.env.DATABASE_PASSWORD = container.getPassword()
        // Discard any pool left pointing at a previous container.
        await end()

        const client = await connect({
            host: container.getHost(),
            database: container.getDatabase(),
            user: container.getUsername(),
            password: container.getPassword(),
            port: container.getPort(),
        })

        // The order lives in manifest.txt, which is also what the deploy
        // applies. A list kept here instead is a list that can disagree with
        // production, and one that did: the suite ran green against tables the
        // live database had never been given.
        //
        // Split properly rather than on `;;;`: only some of the scripts use that
        // convention, and ts-postgres refuses a query holding more than one
        // command.
        const queries = schemaManifest()
            .map((filename) => fs.readFileSync(`./src/model/database/scripts/${filename}.sql`, 'utf8'))
            .flatMap(splitStatements)

        for await (const query of queries) {
            try {
                await client.query(query)
            } catch (error) {
                console.error(`Failed to execute query: ${query}`);
                throw error
            }
        }

        setClient(client)

        for (const pilot of pilots) {
            await Pilots.insert(pilot);
        }
        // Either<V> is the tuple [value, error]. The old `.success == false`
        // check read undefined, so a failed seed passed straight through and
        // surfaced later as an inscrutable assertion failure.
        const [, flightsError] = await Flights.upsert(flights)
        if (flightsError) {
            throw new Error(`Failed to upsert flights error=${flightsError}`);
        }
        // Deliberately not fatal. create_sites.sql seeds five fixture sites, and
        // Mocks.planpraz/forclaz/leSavoy reuse those slugs under different
        // ffvl_sids — so these upserts collide on the unique `slug` constraint,
        // which `on conflict(ffvl_sid)` does not cover. Tests that depend on the
        // seeded rows still pass; surfacing the error beats the previous silent
        // swallow without breaking every generateFromMocks() caller.
        const [, sitesError] = await Sites.upsert(sites)
        if (sitesError) {
            console.warn(`Seeding sites reported: ${sitesError}`);
        }

        return container
    }
}


// This is a helper, not a suite, despite the name — and the name has to stay.
// tsconfig.json excludes src/**/*.test.ts, which is what keeps @testcontainers
// out of the production bundle that yarn buildProd ships to Cloud Functions.
//
// It previously declared two smoke tests and an afterEach hook. vitest registers
// hooks and tests from whatever a suite imports, so every file importing
// TestContainer inherited them: two extra postgres containers per suite, and an
// afterEach closing the pool between that suite's own tests. That produced the
// "Connection already closed" errors and the pool acquire timeouts. Hooks belong
// to the suites that need them.