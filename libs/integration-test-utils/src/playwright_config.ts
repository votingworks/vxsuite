import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from '@playwright/test';
import { join } from 'node:path';
import { BASE_URL, OUTPUT_DIR } from './constants';

/** Options for {@link defineIntegrationTestPlaywrightConfig}. */
export interface IntegrationTestPlaywrightConfigOptions {
  /** Browser viewport size — the setting that varies between apps. */
  viewport: { width: number; height: number };
  /** Overall per-test timeout in ms. Omit to use Playwright's default. */
  timeout?: number;
}

/**
 * Builds the shared Playwright config for an app's integration-testing suite.
 * The app loads its own `.env` and sets `NODE_ENV` before calling this, since
 * those depend on the config file's location.
 */
export function defineIntegrationTestPlaywrightConfig(
  options: IntegrationTestPlaywrightConfigOptions
): PlaywrightTestConfig {
  const isCi = Boolean(process.env['CI']);
  return defineConfig({
    testDir: './e2e',
    outputDir: OUTPUT_DIR,
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    // All test suites share one server, so they cannot run in parallel; global
    // state like Java card mocking also precludes parallelism.
    workers: 1,
    fullyParallel: false,
    // Fail the build on CI if a test.only was accidentally left in the source.
    forbidOnly: isCi,
    retries: isCi ? 2 : 0,
    reporter: [
      ['list'],
      ['html', { open: 'never' }],
      ['junit', { outputFile: join(OUTPUT_DIR, 'results.xml') }],
    ],
    use: {
      // eslint-disable-next-line vx/gts-identifiers -- Playwright's API property
      baseURL: BASE_URL,
      // Collect a trace when retrying a failed test.
      trace: 'on-first-retry',
    },
    projects: [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          video: 'on',
          viewport: options.viewport,
        },
      },
    ],
    webServer: {
      command: 'make run',
      url: BASE_URL,
      reuseExistingServer: !isCi,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  });
}
