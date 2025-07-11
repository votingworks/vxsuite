import path from 'node:path';
import * as builders from '../builders';

export const definitionXml = builders.file(
  'data/electionGridLayoutNewHampshireTestBallot/definition.xml'
);
export const electionJson = builders.election(
  'data/electionGridLayoutNewHampshireTestBallot/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;

// Generated by libs/fixture-generators script: pnpm generate-cvr-fixtures
const castVoteRecords = builders.directory(
  'data/electionGridLayoutNewHampshireTestBallot/castVoteRecords'
);
export const castVoteRecordExport = {
  asDirectoryPath: () =>
    path.join(
      castVoteRecords.asDirectoryPath(),
      'machine_0000__2024-01-01_00-00-00'
    ),
} as const;

export const manualCastVoteRecordExport = {
  asDirectoryPath: () => path.join(castVoteRecords.asDirectoryPath(), 'manual'),
} as const;
