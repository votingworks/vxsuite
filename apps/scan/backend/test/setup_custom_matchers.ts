import { toMatchPdfSnapshot } from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(): Promise<R>;
    }
  }
}

expect.extend({ toMatchImageSnapshot, toMatchPdfSnapshot });
