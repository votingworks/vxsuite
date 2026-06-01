import type { Page } from '@playwright/test';
import { buildDippedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxAdmin auth helpers for integration tests (dipped smart-card auth). */
export const {
  enterPin,
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logOut,
  forceLogOut,
  forceLogOutAndResetElectionDefinition,
} = buildDippedSmartCardAuthHelpers({
  appName: 'VxAdmin',
  async navigateToUnconfigure(page: Page) {
    await page.getByRole('button', { name: 'Election', exact: true }).click();
  },
});
