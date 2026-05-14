import { afterAll, beforeAll, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing';

vi.mock('node-hid', () => ({
  default: { devices: () => [], HID: vi.fn() },
  devices: () => [],
  HID: vi.fn(),
}));

afterAll(async () => {
  await cleanupCachedBrowser();
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
