import { afterAll, beforeAll, expect } from 'vitest';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { toMatchImage } from '@votingworks/image-utils';

expect.extend({ toMatchImage, toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
