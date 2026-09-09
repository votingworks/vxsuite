import { afterAll, beforeAll, expect } from 'vitest';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { toMatchImage, ToMatchImageOptions } from '@votingworks/image-utils';
import { RgbaImageData } from '@votingworks/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toMatchImage(
        expected: RgbaImageData,
        options?: ToMatchImageOptions
      ): Promise<void>;
    }
  }
}

expect.extend({ toMatchImage, toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
