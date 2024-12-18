import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  toMatchPdfSnapshot,
  ToMatchPdfSnapshotOptions,
} from '@votingworks/image-utils';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

afterAll(async () => {
  await cleanupCachedBrowser();
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
    }
  }
}

expect.extend({ toMatchImageSnapshot, toMatchPdfSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
