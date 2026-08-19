import { expect, test } from 'vitest';
import {
  NETWORK_POLLING_INTERVAL_MS,
  NETWORK_REQUEST_TIMEOUT_MS,
} from './globals.js';

test('network timing constants', () => {
  expect(NETWORK_POLLING_INTERVAL_MS).toBeGreaterThan(0);
  expect(NETWORK_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
});
