import { Client } from '@votingworks/db';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  type BallotPositions,
  type BallotStyle,
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

const style1: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[0]),
  ballotPositions: [
    [[contestPos1], []],
    [[contestPos2], []],
  ],
};

const style2: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[1]),
  ballotPositions: [
    [[contestPos2], []],
    [[contestPos1], []],
  ],
};

test('non-split election definition - imports from parsed election', async () => {
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
    ballotStyles: [style1, style2],
  };

  const client = Client.memoryClient(`${import.meta.dirname}/schema.sql`);
  const store = new BallotMetaStore(client);

  const pkgFile = makeTemporaryFile({ content: await zipFile({}) });
  await withElectionPackageZip(pkgFile, async (zip) => {
    await store.importPositions(zip, election, settings);
  });

  expect(store.getBallotPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(store.getBallotPositions(style2.id)).toEqual(style2.ballotPositions);
  expect(store.getBallotPositions(style3NoPositions.id)).toBeNull();
  expect(store.getBallotPositions('invalid')).toBeNull();
});

test('split election definition - imports from ballotPositions.jsonl', async () => {
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

  expect(store.getBallotPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(store.getBallotPositions(style2.id)).toEqual(style2.ballotPositions);
  expect(store.getBallotPositions('invalid')).toBeNull();
});

function positionsFromBallotStyle(bs: BallotStyle): BallotPositions {
  return {
    ballotStyleId: bs.id,
    positions: assertDefined(bs.ballotPositions),
  };
}
