import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@database": path.resolve(__dirname, "./src/data/database"),
      "@model": path.resolve(__dirname, "./src/data/model"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@ploufbag/common": path.resolve(__dirname, "../common/dist"),
    }
  },
  test: {
    disableConsoleIntercept: true,
    silent: false,
    exclude: ['node_modules/**/*', 'dist/**/*'],
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/app/api/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts']
    }
  },
});