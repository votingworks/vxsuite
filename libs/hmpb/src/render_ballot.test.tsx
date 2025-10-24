import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { test, expect } from 'vitest';
import {
  BALLOT_MODES,
  BallotType,
  BaseBallotProps,
  Election,
} from '@votingworks/types';
import { assert, iter } from '@votingworks/basics';
import {
  allBaseBallotProps,
  layOutMinimalBallotsToCreateElectionDefinition,
} from './render_ballot';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { ballotTemplates } from './ballot_templates';
import { vxFamousNamesFixtures } from './ballot_fixtures';
import { rotateCandidatesByStatute } from './ballot_templates/nh_ballot_template';

function combinations<T extends Record<string, unknown>>(
  arrays: Array<Array<Partial<T>>>
): T[] {
  return arrays.reduce(
    (acc, array) =>
      acc.flatMap((accItem) =>
        array.map((arrayItem) => ({ ...accItem, ...arrayItem }))
      ),
    [{}]
  ) as T[];
}

test('allBaseBallotProps creates props for all possible ballots for an election', () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const allBallotProps = allBaseBallotProps(election);
  const expectedPropCombos = combinations<
    Pick<
      BaseBallotProps,
      'ballotStyleId' | 'precinctId' | 'ballotType' | 'ballotMode'
    >
  >([
    election.ballotStyles.flatMap((ballotStyle) =>
      ballotStyle.precincts.map((precinctId) => ({
        ballotStyleId: ballotStyle.id,
        precinctId,
      }))
    ),
    [{ ballotType: BallotType.Absentee }, { ballotType: BallotType.Precinct }],
    BALLOT_MODES.map((ballotMode) => ({ ballotMode })),
  ]);

  const someBallotStyle = election.ballotStyles[0];
  const somePrecinctId = someBallotStyle.precincts[0];

  expect(allBallotProps).toContainEqual({
    election,
    ballotStyleId: someBallotStyle.id,
    precinctId: somePrecinctId,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
  });

  expect(allBallotProps).toHaveLength(expectedPropCombos.length);
  for (const expectedPropCombo of expectedPropCombos) {
    const expectedProps: BaseBallotProps = { ...expectedPropCombo, election };
    expect(allBallotProps).toContainEqual(expectedProps);
  }
  for (const actualProps of allBallotProps) {
    expect(actualProps.watermark).toBeUndefined();
  }
});

test('layOutMinimalBallotsToCreateElectionDefinition', async () => {
  const fixtureElectionDefinition = vxFamousNamesFixtures.electionDefinition;
  const allBallotProps = allBaseBallotProps(fixtureElectionDefinition.election);
  const rendererPool = await createPlaywrightRendererPool();
  const electionDefinition =
    await layOutMinimalBallotsToCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      allBallotProps,
      'vxf'
    );
  expect(electionDefinition).toEqual(fixtureElectionDefinition);
});

test('reorder candidates based on rotation from template', async () => {
  const fixtureElection: Election = {
    ...vxFamousNamesFixtures.electionDefinition.election,
    signature: {
      caption: 'test caption',
      image: '<svg></svg>',
    },
  };
  const allBallotProps = allBaseBallotProps(fixtureElection);
  const rendererPool = await createPlaywrightRendererPool();
  const { election } = await layOutMinimalBallotsToCreateElectionDefinition(
    rendererPool,
    ballotTemplates.NhBallot,
    allBallotProps,
    'vxf'
  );

  const {
    contests: fixtureContests,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    gridLayouts: _fixtureGridLayouts,
    ...restFixtureElection
  } = fixtureElection;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contests, gridLayouts: _gridLayouts, ...restElection } = election;

  expect(restElection).toEqual(restFixtureElection);
  for (const [contest, fixtureContest] of iter(contests).zip(fixtureContests)) {
    assert(contest.id === fixtureContest.id);
    assert(contest.type === 'candidate');
    assert(fixtureContest.type === 'candidate');
    const { candidates, ...restContest } = contest;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { candidates: _fixtureCandidates, ...restFixtureContest } =
      fixtureContest;
    expect(restContest).toEqual(restFixtureContest);
    expect(candidates.map((c) => c.id)).toEqual(
      rotateCandidatesByStatute(fixtureContest)
    );
  }
});
