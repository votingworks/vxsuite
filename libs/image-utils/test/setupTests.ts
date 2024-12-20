import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { ImageData } from 'canvas';
import { afterAll, beforeAll, expect } from 'vitest';
import { toMatchImage, ToMatchImageOptions } from '../src';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toMatchImage(
        expected: ImageData,
        options?: ToMatchImageOptions
      ): Promise<CustomMatcherResult>;
    }
  }
}

expect.extend({ toMatchImage });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
