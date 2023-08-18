import { assert, iter } from '@votingworks/basics';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  famousNamesFixtures,
  sampleElectionFixtures,
} from '@votingworks/hmpb-render-backend';
import { DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import {
  sortVotesDict,
  ballotPdfToPageImages,
  votesForSheet,
} from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

describe('HMPB - Famous Names', () => {
  const {
    electionDefinition,
    gridLayout,
    votes,
    blankBallotPath,
    markedBallotPath,
  } = famousNamesFixtures;
  const { election } = electionDefinition;

  test('Blank ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
      },
      ballotImagePaths as [string, string]
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Marked ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
      },
      ballotImagePaths as [string, string]
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(
      sortVotesDict({
        ...frontResult.interpretation.votes,
        ...backResult.interpretation.votes,
      })
    ).toEqual(sortVotesDict(votes));
  });

  test('Wrong election', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          electionHash: 'wrong election hash',
        },
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidElectionHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidElectionHashPage');
  });

  test('Wrong precinct', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    const { precinctId } = gridLayout;
    assert(precinctId !== election.precincts[1]!.id);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          election.precincts[1]!.id
        ),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidPrecinctPage');
    expect(backResult.interpretation.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidTestModePage');
    expect(backResult.interpretation.type).toEqual('InvalidTestModePage');
  });
});

for (const {
  targetMarkPosition,
  paperSize,
  density,
  electionDefinition,
  gridLayout,
  votes,
  blankBallotPath,
  markedBallotPath,
} of sampleElectionFixtures.slice(0, 1)) {
  describe(`HMPB - sample election - bubbles on ${targetMarkPosition} - ${paperSize} paper - density ${density}`, () => {
    test(`Blank ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
      const { precinctId } = gridLayout;

      for (const sheetImagePaths of iter(ballotImagePaths).chunks(2)) {
        assert(sheetImagePaths.length === 2);
        const [frontResult, backResult] = await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: true,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
          },
          sheetImagePaths
        );

        assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
        expect(frontResult.interpretation.votes).toEqual({});
        assert(backResult.interpretation.type === 'InterpretedHmpbPage');
        expect(backResult.interpretation.votes).toEqual({});
      }
    });

    test(`Marked ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
      const { precinctId } = gridLayout;

      for (const [sheetIndex, sheetImagePaths] of iter(ballotImagePaths)
        .chunks(2)
        .enumerate()) {
        assert(sheetImagePaths.length === 2);
        const [frontResult, backResult] = await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: true,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
          },
          sheetImagePaths
        );

        const sheetNumber = sheetIndex + 1;
        const expectedVotes = votesForSheet(votes, sheetNumber, gridLayout);

        assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
        assert(backResult.interpretation.type === 'InterpretedHmpbPage');
        expect(
          sortVotesDict({
            ...frontResult.interpretation.votes,
            ...backResult.interpretation.votes,
          })
        ).toEqual(sortVotesDict(expectedVotes));
      }
    });
  });
}
