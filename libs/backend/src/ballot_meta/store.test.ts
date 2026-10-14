import { Client } from '@votingworks/db';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  type BallotCandidateOrderings,
  type BallotPositions,
  type BallotStyle,
  type CandidateOrderings,
  type ContestPosition,
  type Election,
  type SystemSettings,
} from '@votingworks/types';
import { expect, test } from 'vitest';
import {
  electionGeneralFixtures,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { zipFile } from '@votingworks/test-utils';
import { withElectionPackageZip } from '../election_package/election_package_io.js';
import { BallotMetaStore } from './store.js';

const baseElection = electionGeneralFixtures.readElection();

const contestPos1: ContestPosition = {
  bounds: { column: 0, height: 1, row: 3, width: 4 },
  contestId: 'contest-1',
  options: [],
};

const contestPos2: ContestPosition = {
  bounds: { column: 4, height: 3, row: 2, width: 1 },
  contestId: 'contest-2',
  options: [],
};

const candidateOrderings1: CandidateOrderings = {
  'contest-1': [{ id: 'candidate-1', partyIds: ['party-1'] }],
};

const candidateOrderings2: CandidateOrderings = {
  'contest-4': [{ id: 'candidate-4', partyIds: ['party-4'] }],
  'contest-2': [
    { id: 'candidate-3', partyIds: ['party-3'] },
    { id: 'candidate-2', partyIds: ['party-2'] },
  ],
};

const style1: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[0]),
  ballotPositions: [
    [[contestPos1], []],
    [[contestPos2], []],
  ],
  orderedCandidatesByContest: candidateOrderings1,
};

const style2: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[1]),
  ballotPositions: [
    [[contestPos2], []],
    [[contestPos1], []],
  ],
  orderedCandidatesByContest: candidateOrderings2,
};

test('non-split election definition - imports positions from parsed election', async () => {
  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: false,
  };

  const style3NoPositions: BallotStyle = {
    ...style2,
    id: 'style 3 - no positions',
    ballotPositions: undefined,
  };

  const election: Election = {
    ...baseElection,
    ballotStyles: [style1, style2, style3NoPositions],
  };

  const client = Client.memoryClient(`${import.meta.dirname}/schema.sql`);
  const store = new BallotMetaStore(client);

  const pkgFile = makeTemporaryFile({ content: await zipFile({}) });
  await withElectionPackageZip(pkgFile, async (zip) => {
    await store.importPositions(zip, election, settings);
  });

  expect(store.getPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(store.getPositions(style2.id)).toEqual(style2.ballotPositions);
  expect(store.getPositions(style3NoPositions.id)).toBeNull();
  expect(store.getPositions('invalid')).toBeNull();
});

test('split election definition - imports positions from ballotPositions.jsonl', async () => {
  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: true,
  };

  const election: Election = { ...baseElection, ballotStyles: [] };

  const client = Client.memoryClient(`${import.meta.dirname}/schema.sql`);
  const store = new BallotMetaStore(client);

  const pkgData = await zipFile({
    [ElectionPackageFileName.BALLOT_POSITIONS]: [
      JSON.stringify(positionsFromBallotStyle(style1)),
      JSON.stringify(positionsFromBallotStyle(style2)),
      '',
    ].join('\n'),
  });

  const pkgFile = makeTemporaryFile({ content: pkgData });
  await withElectionPackageZip(pkgFile, async (zip) => {
    await store.importPositions(zip, election, settings);
  });

  expect(store.getPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(store.getPositions(style2.id)).toEqual(style2.ballotPositions);
  expect(store.getPositions('invalid')).toBeNull();
});

test('single-file election - imports candidate orderings from parsed election', async () => {
  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: false,
  };

  const style3NoOrderings: BallotStyle = {
    ...style2,
    id: 'style 3 - no orderings',
    orderedCandidatesByContest: undefined,
  };

  const election: Election = {
    ...baseElection,
    ballotStyles: [style1, style2, style3NoOrderings],
  };

  const client = Client.memoryClient(`${import.meta.dirname}/schema.sql`);
  const store = new BallotMetaStore(client);

  const pkgFile = makeTemporaryFile({ content: await zipFile({}) });
  await withElectionPackageZip(pkgFile, async (zip) => {
    await store.importCandidateOrderings(zip, election, settings);
  });

  expect(store.getCandidateOrderings(style1.id)).toEqual(
    style1.orderedCandidatesByContest
  );
  expect(store.getCandidateOrderings(style2.id)).toEqual(
    style2.orderedCandidatesByContest
  );
  expect(store.getCandidateOrderings(style3NoOrderings.id)).toBeNull();
  expect(store.getCandidateOrderings('invalid')).toBeNull();
});

test('split-file election - imports orderings from candidateOrderings.jsonl', async () => {
  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: true,
  };

  const election: Election = { ...baseElection, ballotStyles: [] };

  const client = Client.memoryClient(`${import.meta.dirname}/schema.sql`);
  const store = new BallotMetaStore(client);

  const pkgData = await zipFile({
    [ElectionPackageFileName.CANDIDATE_ORDERINGS]: [
      JSON.stringify(candidateOrderingsFromBallotStyle(style1)),
      JSON.stringify(candidateOrderingsFromBallotStyle(style2)),
      '',
    ].join('\n'),
  });

  const pkgFile = makeTemporaryFile({ content: pkgData });
  await withElectionPackageZip(pkgFile, async (zip) => {
    await store.importCandidateOrderings(zip, election, settings);
  });

  expect(store.getCandidateOrderings(style1.id)).toEqual(
    style1.orderedCandidatesByContest
  );
  expect(store.getCandidateOrderings(style2.id)).toEqual(
    style2.orderedCandidatesByContest
  );
  expect(store.getCandidateOrderings('invalid')).toBeNull();
});

function candidateOrderingsFromBallotStyle(
  bs: BallotStyle
): BallotCandidateOrderings {
  return {
    ballotStyleId: bs.id,
    orderings: assertDefined(bs.orderedCandidatesByContest),
  };
}

function positionsFromBallotStyle(bs: BallotStyle): BallotPositions {
  return {
    ballotStyleId: bs.id,
    positions: assertDefined(bs.ballotPositions),
  };
}
