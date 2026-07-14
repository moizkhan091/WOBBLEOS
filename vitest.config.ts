import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Isolate the unit suite from any ambient DATABASE_URL (WOB-AUD-006). The unit tests inject their
    // stores/deps and must never touch a live DB — otherwise the release gate becomes environment-
    // dependent (release:full sets DATABASE_URL for the DB proofs, which would otherwise leak seeded
    // state into unit tests). The DB proofs run separately via `verify:all-db`.
    env: { DATABASE_URL: "" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
