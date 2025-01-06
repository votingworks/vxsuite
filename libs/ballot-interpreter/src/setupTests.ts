import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { afterAll, beforeAll, expect } from 'vitest';

expect.extend({ toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
