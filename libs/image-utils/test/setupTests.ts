import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, expect } from 'vitest';
import { toMatchImage } from '../src';

expect.extend({ toMatchImage });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
