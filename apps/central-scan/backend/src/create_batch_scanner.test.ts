import { beforeEach, expect, test, vi } from 'vitest';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { createBatchScanner } from './create_batch_scanner.js';
import { FujitsuScanner } from './fujitsu_scanner.js';
import { MockBatchScanner } from './mock_batch_scanner.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('./mock_batch_scanner.js'));

const logger = new BaseLogger(LogSource.VxCentralScanService);

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('creates a Fujitsu scanner by default', () => {
  const { scanner, mockBatchScanner } = createBatchScanner({ logger });
  expect(scanner).toBeInstanceOf(FujitsuScanner);
  expect(mockBatchScanner).toBeUndefined();
});

test('creates a mock scanner when the mock scanner flag is enabled', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CENTRAL_SCANNER
  );
  const { scanner, mockBatchScanner } = createBatchScanner({ logger });
  expect(mockBatchScanner).toBeInstanceOf(MockBatchScanner);
  expect(scanner).toEqual(mockBatchScanner);
});
