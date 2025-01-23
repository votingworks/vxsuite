import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { test, expect } from 'vitest';
import { BallotType } from '@votingworks/types';
import {
  allBaseBallotProps,
  BaseBallotProps,
  renderMinimalBallotsToCreateElectionDefinition,
} from './render_ballot';
import { BALLOT_MODES } from './types';
import { createPlaywrightRenderer } from './playwright_renderer';
import { ballotTemplates } from './ballot_templates';

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

test('allBaseBallotProps creates props all possible ballots for an election', () => {
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
  expect(allBallotProps).toHaveLength(expectedPropCombos.length);
  for (const expectedPropCombo of expectedPropCombos) {
    const expectedProps: BaseBallotProps = { ...expectedPropCombo, election };
    expect(allBallotProps).toContainEqual(expectedProps);
  }
  for (const actualProps of allBallotProps) {
    expect(actualProps.watermark).toBeUndefined();
  }
});

test('renderMinimalBallotsToCreateElectionDefinition', async () => {
  const fixtureElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const allBallotProps = allBaseBallotProps(fixtureElectionDefinition.election);
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.VxDefaultBallot,
      allBallotProps,
      'vxf'
    );
  expect(electionDefinition).toEqual(fixtureElectionDefinition);
});
