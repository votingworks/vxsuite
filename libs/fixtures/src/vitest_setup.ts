// @coverage-exclude-file: used by other packages' vitest setup files
import { afterAll, beforeAll } from 'vitest';
import { clearTemporaryRootDir, setupTemporaryRootDir } from './tmpdir.js';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
