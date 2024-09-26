import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { cleanupCachedBrowser } from '@votingworks/printing';

afterAll(async () => {
  await cleanupCachedBrowser();
});

expect.extend({ toMatchImageSnapshot });
