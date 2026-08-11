import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from '@playwright/test';
import { join } from 'node:path';
import { BASE_URL, OUTPUT_DIR } from './constants';

// Resolves to the built `global_setup.js` alongside this compiled module, so
// the path is correct regardless of which app loads the shared config.
const GLOBAL_SETUP_PATH = join(__dirname, 'global_setup.js');

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
    // Wait for the backend (not just the Vite dev server) to be reachable
    // before any test runs, so API calls in `beforeEach` don't race startup.
    globalSetup: GLOBAL_SETUP_PATH,
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
      // The backends log every state-machine event and transition to stdout,
      // which floods the test output with large JSON lines. Redirect stdout
      // to a file so the logs stay available for debugging without drowning
      // out the test results; stderr still streams through so server crashes
      // are visible.
      command: `mkdir -p ${OUTPUT_DIR} && make run > ${OUTPUT_DIR}/server-output.log`,
      url: BASE_URL,
      reuseExistingServer: !isCi,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  });
}
