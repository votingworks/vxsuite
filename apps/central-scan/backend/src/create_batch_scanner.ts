import { join } from 'node:path';
import { DEFAULT_DEV_DOCK_DIR } from '@votingworks/dev-dock-backend';
import type { BaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import type { BatchScanner } from './batch_scanner.js';
import { FujitsuScanner, ScannerMode } from './fujitsu_scanner.js';
import { MockBatchScanner } from './mock_batch_scanner.js';

export interface CreatedBatchScanner {
  readonly scanner: BatchScanner;
  /** Present only when the mock scanner is in use, for the dev dock to drive. */
  readonly mockBatchScanner?: MockBatchScanner;
}

/** Creates the batch scanner selected by the environment's feature flags. */
export function createBatchScanner({
  logger,
}: {
  logger: BaseLogger;
}): CreatedBatchScanner {
  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.USE_MOCK_CENTRAL_SCANNER
    )
  ) {
    const mockBatchScanner = new MockBatchScanner(
      join(DEFAULT_DEV_DOCK_DIR, 'batch-images')
    );
    return { scanner: mockBatchScanner, mockBatchScanner };
  }

  return { scanner: new FujitsuScanner({ mode: ScannerMode.Gray, logger }) };
}
