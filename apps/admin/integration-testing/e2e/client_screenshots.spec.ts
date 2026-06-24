import { expect, test } from '@playwright/test';
import {
  buildIntegrationTestHelper,
  createScreenshotNamer,
} from '@votingworks/integration-test-utils';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { mockCardRemoval } from '@votingworks/auth';
import { logInAsSystemAdministrator } from './support/auth';

// Screenshots of VxAdmin running in adjudication-station (client) mode. These
// run against a second VxAdmin instance started in client mode by the
// `run-client` Makefile target (see playwright.config.ts), reachable at this
// suite's project baseURL (port 3100).
//
// Client networking (avahi host discovery) is disabled under integration tests
// (see server.ts), so the connection status shown on screen is driven
// deterministically by posting to the client's `/api/test/set-connection`
// route.

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  // The client instance never configures an election, so resetting between
  // tests just means logging out and returning to the locked screen.
  await page.request.post('/api/logOut', { data: {} });
  mockCardRemoval();
  await page.goto('/');
  await page.clock.install();
});

test('multi-station adjudication station', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const { screenshot, screenshotWithButtonHighlight, screenshotWithLocatorHighlight } =
    buildIntegrationTestHelper(page, namer);

  // Sets the client's connection status, then advances the clock so the polled
  // network-status query (paused by the installed fake clock) refetches.
  async function setConnection(data: {
    status: string;
    hostMachineId?: string;
  }) {
    const response = await page.request.post('/api/test/set-connection', {
      data,
    });
    expect(response.ok()).toBeTruthy();
    await page.clock.fastForward(2000);
  }

  await logInAsSystemAdministrator(page);
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByRole('heading', { name: 'Network' }).waitFor();

  // Connected to a host — the steady state. Highlight the control that returns
  // this station to host mode.
  await setConnection({
    status: 'online-connected-to-host',
    hostMachineId: 'VX-ADMIN-01',
  });
  await page.getByText(/Connected to host/).waitFor();
  await screenshot('client-settings-connected');
  await screenshotWithButtonHighlight(
    'Switch to Host Mode',
    'client-switch-to-host-mode-highlighted'
  );

  // Network status problems shown on the adjudication station.
  await setConnection({ status: 'online-waiting-for-host' });
  await page.getByText(/Searching for host/).waitFor();
  await screenshotWithLocatorHighlight(
    page.getByText(/Searching for host/),
    'client-network-searching-highlighted'
  );

  await setConnection({ status: 'online-multiple-hosts-detected' });
  await page.getByText(/Multiple hosts detected/).waitFor();
  await screenshotWithLocatorHighlight(
    page.getByText(/Multiple hosts detected/),
    'client-network-multiple-hosts-highlighted'
  );

  await setConnection({ status: 'offline' });
  await page.getByText(/Offline — no network connection/).waitFor();
  await screenshotWithLocatorHighlight(
    page.getByText(/Offline — no network connection/),
    'client-network-offline-highlighted'
  );
});
