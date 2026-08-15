import {defineConfig} from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@/model": path.resolve(__dirname, "./src/model"),
            "@/database": path.resolve(__dirname, "./src/model/database"),
            // Point at the directory, not at index. tsconfig declares two
            // mappings for these ("@/stravaApi" exact and "@/stravaApi/*"
            // wildcard), but a string alias here is a prefix substitution and
            // can only express one. Aliasing to .../index made the subpath
            // import "@/stravaApi/model" resolve to ".../stravaApi/index/model".
            // Aliasing to the directory serves both: Vite resolves the bare
            // specifier to index itself.
            "@/stravaApi": path.resolve(__dirname, "./src/model/stravaApi"),
            "@/ffvlApi": path.resolve(__dirname, "./src/model/ffvlApi"),
            "@/tasks": path.resolve(__dirname, "./src/tasks"),
            "@/api": path.resolve(__dirname, "./src/api"),
            "@/webhooks": path.resolve(__dirname, "./src/webhooks"),
            "@/utils": path.resolve(__dirname, "./src/utils"),
            "@/jwt": path.resolve(__dirname, "./src/jwt")
        }
    },
    test: {
        disableConsoleIntercept: true,
        silent: false,
        exclude: [
            '**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**',
            // Helpers, not suites — they contain no tests, and vitest fails a
            // collected file with none ("No test suite found in file"). They
            // must keep the .test.ts suffix regardless: tsconfig.json excludes
            // src/**/*.test.ts, which is what keeps @testcontainers out of the
            // bundle yarn buildProd ships to Cloud Functions.
            '**/Mocks.test.ts',
            '**/generateContainer.test.ts',
        ],
        env: {
            FFVL_KEY: ""
        },
        testTimeout: 60_000,
        // Testcontainers pulls and starts a PostgreSQL image inside beforeAll.
        // hookTimeout defaults to 10s regardless of testTimeout, which a cold
        // runner never meets — the cause of "Hook timed out in 10000ms".
        hookTimeout: 120_000,
        // setupFiles: ['dotenv/config'],
    },
})