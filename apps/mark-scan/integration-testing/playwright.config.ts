import { defineIntegrationTestPlaywrightConfig } from '@votingworks/integration-test-utils';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(import.meta.dirname, '.env') });
// Must match the NODE_ENV set for the backend in the Makefile's `run` target,
// so that both processes resolve mock file paths to the same directory.
process.env['NODE_ENV'] = 'production';

/** See https://playwright.dev/docs/test-configuration. */
export default defineIntegrationTestPlaywrightConfig({
  viewport: { width: 1080, height: 1920 },
  // The basic-election-flow test does real work (auth, cardless session, scan +
  // interpret, rendering) and runs ~21-22s; Playwright's default 30s timeout is
  // too tight under CI load, where it tips over and times out waiting for the
  // transient "Loading Sheet" screen. Match the 90s headroom the scan and
  // central-scan integration suites already use.
  timeout: 90_000,
});
