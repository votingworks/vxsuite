import { beforeEach, expect, test, vi } from 'vitest';
import { ScannerClient } from '@votingworks/deskpro-scanner';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { createBatchScanner } from './create_batch_scanner.js';
import { DeskProBatchScanner } from './deskpro_batch_scanner.js';
import { FujitsuScanner } from './fujitsu_scanner.js';
import { MockBatchScanner } from './mock_batch_scanner.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('./mock_batch_scanner.js'));
vi.mock(import('./deskpro_batch_scanner.js'));
vi.mock(import('@votingworks/deskpro-scanner'));

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

test('creates a DeskPro scanner when the DeskPro flag is enabled', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_DESKPRO_CENTRAL_SCANNER
  );
  const { scanner, mockBatchScanner } = createBatchScanner({ logger });
  expect(scanner).toBeInstanceOf(DeskProBatchScanner);
  expect(mockBatchScanner).toBeUndefined();

  const [{ createClient }] = vi.mocked(DeskProBatchScanner).mock.calls[0]!;
  expect(createClient()).toBeInstanceOf(ScannerClient);
});

test('prefers the mock scanner over the DeskPro', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CENTRAL_SCANNER
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_DESKPRO_CENTRAL_SCANNER
  );
  const { scanner } = createBatchScanner({ logger });
  expect(scanner).toBeInstanceOf(MockBatchScanner);
});
