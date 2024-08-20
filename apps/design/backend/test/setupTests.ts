import {
  toMatchPdfSnapshot,
  ToMatchPdfSnapshotOptions,
} from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
    }
  }
}

expect.extend({ toMatchImageSnapshot, toMatchPdfSnapshot });
