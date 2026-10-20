import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The suite runs the dashboard in demo mode: the Supabase variables are forced
 * empty, so the auth middleware opens every route and every page reads
 * `src/lib/mock.ts`. No credentials, no network, no database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The dev server compiles routes on first hit; more workers means more
  // concurrent compiles and flaky first-navigation timeouts.
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build keeps the suite fast and free of dev-server compile
    // races. The empty env below still forces demo mode.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // Empty strings keep the app in demo mode even when .env.local exists.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      INTERNAL_WORKER_TOKEN: "",
      INTERNAL_WORKER_URL: "",
    },
  },
});
