import type { CastVoteRecordFileMetadata as CvrExport } from '@votingworks/admin-backend';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';

export const electionDefinition = readElectionGeneralDefinition();
export const [location1, location2] = electionDefinition.election.pollingPlaces;

export const location1Export: CvrExport = {
  cvrCount: 2048,
  exportTimestamp: new Date('2026-11-03T18:00:00Z'),
  name: `${location1.name}-export`,
  pollingPlaceIds: [location1.id],
  path: `${location1.name}-export`,
  isTestModeResults: false,
  scannerIds: ['SCN-01'],
};

export const location2Export: CvrExport = {
  cvrCount: 123,
  exportTimestamp: new Date('2026-11-03T19:00:00Z'),
  name: `${location2.name}-export`,
  pollingPlaceIds: [location2.id],
  path: `${location2.name}-export`,
  isTestModeResults: false,
  scannerIds: ['SCN-01'],
};
