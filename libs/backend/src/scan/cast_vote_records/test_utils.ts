import { ok } from '@votingworks/basics';

import { CastVoteRecordExporterApi } from './cast_vote_record_exporter';

/**
 * Builds a mock cast vote record exporter instance for application-level tests
 */
export function buildMockCastVoteRecordExporter(): jest.Mocked<CastVoteRecordExporterApi> {
  return {
    exportCastVoteRecordsToUsbDrive: jest.fn().mockResolvedValue(ok()),
  };
}
