import { sleep } from '@votingworks/basics';
import { methodUrl } from '@votingworks/grout';
import { BASE_URL } from './constants';

/**
 * Side-effect-free grout method posted to probe backend readiness. Present in
 * every app's API, so the gate works for all integration suites.
 */
const READINESS_METHOD = 'getAuthStatus';

/** How long to wait for the backend to respond before giving up. */
const READINESS_TIMEOUT_MS = 60_000;

/** Delay between readiness probes. */
const POLL_INTERVAL_MS = 250;

/**
 * Playwright `globalSetup` that blocks until the app backend answers an API
 * call through the dev-server proxy.
 *
 * Playwright's `webServer.url` only confirms the Vite dev server (port 3000) is
 * serving; it does not confirm the backend (port 3001) that Vite proxies
 * `/api/*` to has finished starting. A test that posts to the API in
 * `beforeEach` therefore races backend startup and gets a 504 from the proxy.
 * The `retries` setting then masks it as a passing-on-retry flake — most
 * reliably on VxMarkScan, whose backend is the slowest to boot. Polling a real
 * round-trip here closes that window before any test runs.
 *
 * `webServer` is started before `globalSetup`, so the proxy is already up and
 * each probe reaches the backend (returning 5xx until it is ready, then 200).
 */
export async function waitForBackendReady(): Promise<void> {
  const url = methodUrl(READINESS_METHOD, `${BASE_URL}/api`);
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastResult = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (response.ok) {
        return;
      }
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Backend at ${url} not ready after ${READINESS_TIMEOUT_MS}ms (last: ${lastResult})`
  );
}

// Playwright invokes a global-setup module's default export.
// eslint-disable-next-line vx/gts-no-default-exports -- required by Playwright's globalSetup contract
export default waitForBackendReady;
