import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/setup.js"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations, ADMIN_TOKEN: "test-token", RATE_SALT: "test-salt", RATE_MAX: "3", STECKBRIEF_SECRET: "test-steckbrief-geheimnis-0123456789" },
          },
        },
      },
    },
  };
});
