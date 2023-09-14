import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';

const baseURL = 'http://127.0.0.1:3000';
const outputDir = './test-results';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir,
  /* Opt out of parallel tests due to shared global state like Java card mocking. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: join(outputDir, 'results.xml') }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        video: 'on',
        viewport: {
          width: 1920,
          height: 1080,
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'make run',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
