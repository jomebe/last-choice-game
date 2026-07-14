import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180000,
  expect: {
    timeout: 90000,
  },
  fullyParallel: false, // 동시 멀티플레이 연동을 하므로 순차 실행이 명확함
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // 멀티플레이어 시나리오는 1개 워커에서 독립적으로 진행되어야 함
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8788",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
