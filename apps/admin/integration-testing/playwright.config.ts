import {
  defineIntegrationTestPlaywrightConfig,
  HP_ELITEBOOK_VIEWPORT,
} from '@votingworks/integration-test-utils';
import type { PlaywrightTestConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(__dirname, '.env') });
// Must match the NODE_ENV set for the backend in the Makefile's `run` target,
// so that both processes resolve mock file paths to the same directory.
process.env['NODE_ENV'] = 'production';

const isCi = Boolean(process.env['CI']);

// A second VxAdmin instance running in adjudication-station (client) mode (see
// the `run-client` Makefile target), served on its own frontend port so the
// client-mode screenshots can run against it while the default host instance
// stays on port 3000.
const CLIENT_BASE_URL = 'http://127.0.0.1:3100';
const CLIENT_SPEC = /client_screenshots\.spec\.ts/;

const baseConfig = defineIntegrationTestPlaywrightConfig({
  viewport: HP_ELITEBOOK_VIEWPORT,
  timeout: 60_000,
});

const hostProject = (baseConfig.projects ?? [])[0] ?? {};
const hostProjectUse = hostProject.use ?? {};
const hostWebServer = baseConfig.webServer;

/** See https://playwright.dev/docs/test-configuration. */
const config: PlaywrightTestConfig = {
  ...baseConfig,
  projects: [
    // Host instance (port 3000): everything except the client-mode suite.
    { ...hostProject, name: 'chromium', testIgnore: CLIENT_SPEC },
    // Client instance (port 3100): only the client-mode suite.
    {
      ...hostProject,
      name: 'chromium-client',
      testMatch: CLIENT_SPEC,
      use: { ...hostProjectUse, baseURL: CLIENT_BASE_URL },
    },
  ],
  webServer: [
    ...(Array.isArray(hostWebServer)
      ? hostWebServer
      : hostWebServer
        ? [hostWebServer]
        : []),
    {
      command: 'make run-client',
      url: CLIENT_BASE_URL,
      reuseExistingServer: !isCi,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
};

export default config;
