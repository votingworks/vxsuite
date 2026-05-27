import test from '@playwright/test';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { buildIntegrationTestHelper } from '@votingworks/test-utils';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test('screenshots', async ({ page }) => {
  const { screenshot } = buildIntegrationTestHelper(page);

  await page.goto('/');
  await page
    .getByText('Insert an election manager card to configure VxScan')
    .waitFor();
  await screenshot('unconfigured-screen');
});
