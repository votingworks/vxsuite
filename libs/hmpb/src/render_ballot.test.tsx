import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import { test, expect } from 'vitest';
import { BallotType, HmpbBallotPaperSize } from '@votingworks/types';
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

test('v3-compatible NH ballot - letter', async () => {
  const fixtureElection = electionGeneralFixtures.readElection();
  const allBallotProps = allBaseBallotProps(fixtureElection);
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.NhBallotV3,
      allBallotProps,
      'vxf'
    );

  // Bubbles and WIA crop should be snapped to grid
  for (const gridLayout of electionDefinition.election.gridLayouts!) {
    for (const gridPosition of gridLayout.gridPositions) {
      expect(gridPosition.column % 1).toEqual(0);
      expect(gridPosition.row % 1).toEqual(0);
    }
    expect(gridLayout.optionBoundsFromTargetMark.bottom % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.left % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.right % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.top % 1).toEqual(0);
  }

  // Election date should be off by one day to account for timezone bug in v3
  expect(fixtureElection.date.toISOString()).toEqual('2020-11-03');
  expect(electionDefinition.election.date.toISOString()).toEqual('2020-11-04');
}, 30_000);

test('v3-compatible NH ballot (compact) - letter', async () => {
  const fixtureElection = electionGeneralFixtures.readElection();
  const allBallotProps = allBaseBallotProps(fixtureElection).map((p) => ({
    ...p,
    compact: true,
  }));
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.NhBallotV3Compact,
      allBallotProps,
      'vxf'
    );

  // Bubbles and WIA crop should be snapped to grid
  for (const gridLayout of electionDefinition.election.gridLayouts!) {
    for (const gridPosition of gridLayout.gridPositions) {
      expect(gridPosition.column % 1).toEqual(0);
      expect(gridPosition.row % 1).toEqual(0);
    }
    expect(gridLayout.optionBoundsFromTargetMark.bottom % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.left % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.right % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.top % 1).toEqual(0);
  }

  // Election date should be off by one day to account for timezone bug in v3
  expect(fixtureElection.date.toISOString()).toEqual('2020-11-03');
  expect(electionDefinition.election.date.toISOString()).toEqual('2020-11-04');
}, 30_000);

test('v3-compatible NH ballot - legal', async () => {
  const fixtureElection = electionGeneralFixtures.readElection();
  const allBallotProps = allBaseBallotProps({
    ...fixtureElection,
    ballotLayout: {
      ...fixtureElection.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
  });
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.NhBallotV3,
      allBallotProps,
      'vxf'
    );

  // Bubbles and WIA crop should be snapped to grid
  for (const gridLayout of electionDefinition.election.gridLayouts!) {
    for (const gridPosition of gridLayout.gridPositions) {
      expect(gridPosition.column % 1).toEqual(0);
      expect(gridPosition.row % 1).toEqual(0);
    }
    expect(gridLayout.optionBoundsFromTargetMark.bottom % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.left % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.right % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.top % 1).toEqual(0);
  }

  // Election date should be off by one day to account for timezone bug in v3
  expect(fixtureElection.date.toISOString()).toEqual('2020-11-03');
  expect(electionDefinition.election.date.toISOString()).toEqual('2020-11-04');
}, 30_000);

test('v3-compatible NH ballot (compact) - legal', async () => {
  const fixtureElection = electionGeneralFixtures.readElection();
  const allBallotProps = allBaseBallotProps({
    ...fixtureElection,
    ballotLayout: {
      ...fixtureElection.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
  }).map((p) => ({ ...p, compact: true }));
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.NhBallotV3Compact,
      allBallotProps,
      'vxf'
    );

  // Bubbles and WIA crop should be snapped to grid
  for (const gridLayout of electionDefinition.election.gridLayouts!) {
    for (const gridPosition of gridLayout.gridPositions) {
      expect(gridPosition.column % 1).toEqual(0);
      expect(gridPosition.row % 1).toEqual(0);
    }
    expect(gridLayout.optionBoundsFromTargetMark.bottom % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.left % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.right % 1).toEqual(0);
    expect(gridLayout.optionBoundsFromTargetMark.top % 1).toEqual(0);
  }

  // Election date should be off by one day to account for timezone bug in v3
  expect(fixtureElection.date.toISOString()).toEqual('2020-11-03');
  expect(electionDefinition.election.date.toISOString()).toEqual('2020-11-04');
}, 30_000);
