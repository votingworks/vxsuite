/* eslint-disable vx/gts-jsdoc */
import { Page } from '@playwright/test';
import { mockCardRemoval } from '@votingworks/auth';
import { buildInsertedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

export const { enterPin, logInAsSystemAdministrator, logInAsElectionManager } =
  buildInsertedSmartCardAuthHelpers({
    appName: 'VxMarkScan',
    pinDigitSelector: 'text',
  });

export async function forceUnconfigure(page: Page): Promise<void> {
  await page.goto('/');
  mockCardRemoval();
  await page.waitForTimeout(100);

  await logInAsSystemAdministrator(page);
  await page.getByText('System Administrator Menu').waitFor();
  const unconfigureButton = page.getByRole('button', {
    name: 'Unconfigure Machine',
  });
  if (await unconfigureButton.isEnabled()) {
    await unconfigureButton.click();
    const confirmButton = page.getByRole('button', {
      name: 'Delete All Election Data',
    });
    await confirmButton.click();
  }
  mockCardRemoval();
  await page
    .getByText('Insert an election manager card to configure VxMarkScan')
    .waitFor();
}
