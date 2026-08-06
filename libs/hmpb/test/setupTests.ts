import { afterAll, beforeAll, expect, vi } from 'vitest';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import type { ImageData, ToMatchImageOptions } from '@votingworks/image-utils';

// Loaded with `importActual` rather than imported: this file runs before any
// `vi.mock` is registered, so a module-scope import would instantiate
// image-utils's dependency graph inside vitest's module runner too early and
// leave those modules holding unmocked bindings for the rest of the run.
const { toMatchImage } = await vi.importActual<
  typeof import('@votingworks/image-utils')
>('@votingworks/image-utils');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toMatchImage(
        expected: ImageData,
        options?: ToMatchImageOptions
      ): Promise<void>;
    }
  }
}

expect.extend({ toMatchImage, toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
