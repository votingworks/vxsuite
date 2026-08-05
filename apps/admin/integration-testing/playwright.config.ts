import {
  defineIntegrationTestPlaywrightConfig,
  HP_ELITEBOOK_VIEWPORT,
} from '@votingworks/integration-test-utils';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(import.meta.dirname, '.env') });
// Must match the NODE_ENV set for the backend in the Makefile's `run` target,
// so that both processes resolve mock file paths to the same directory.
process.env['NODE_ENV'] = 'production';

/** See https://playwright.dev/docs/test-configuration. */
export default defineIntegrationTestPlaywrightConfig({
  viewport: HP_ELITEBOOK_VIEWPORT,
  timeout: 60_000,
});
