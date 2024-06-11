import { toMatchImage } from 'jest-image-matcher';
import { Buffer } from 'buffer';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toMatchImage(
        expected: Buffer,
        options?: { dumpDiffToConsole: boolean }
      ): CustomMatcherResult;
    }
  }
}
expect.extend({ toMatchImage });
