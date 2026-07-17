import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:8790" },
  webServer: {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:8790/healthz",
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
