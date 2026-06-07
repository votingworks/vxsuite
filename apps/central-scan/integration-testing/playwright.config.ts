import { defineIntegrationTestPlaywrightConfig } from '@votingworks/integration-test-utils';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(__dirname, '.env') });
// Must match the NODE_ENV set for the backend in the Makefile's `run` target,
// so that both processes resolve mock file paths to the same directory.
process.env['NODE_ENV'] = 'production';

/** See https://playwright.dev/docs/test-configuration. */
export default defineIntegrationTestPlaywrightConfig({
  viewport: { width: 1920, height: 1080 },
});
