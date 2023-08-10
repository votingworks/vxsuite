import { assert } from '@votingworks/basics';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  famousNamesFixtures,
  sampleElectionFixtures,
} from '@votingworks/hmpb-render-backend';
import {
  sortVotesDict,
  ballotPdfToPageImages,
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
    const { precinctId } = gridLayout;
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
      },
      ballotImagePaths
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Marked ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
      },
      ballotImagePaths
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
    const { precinctId } = gridLayout;
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          electionHash: 'wrong election hash',
        },
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
      },
      ballotImagePaths
    );

    expect(frontResult.interpretation.type).toEqual('InvalidElectionHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidElectionHashPage');
  });

  test('Wrong precinct', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    const { precinctId } = gridLayout;
    assert(precinctId !== election.precincts[1]!.id);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          election.precincts[1]!.id
        ),
        testMode: true,
      },
      ballotImagePaths
    );

    expect(frontResult.interpretation.type).toEqual('InvalidPrecinctPage');
    expect(backResult.interpretation.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    const { precinctId } = gridLayout;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: false,
      },
      ballotImagePaths
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
} of sampleElectionFixtures) {
  describe(`HMPB - sample election - bubbles on ${targetMarkPosition} - ${paperSize} paper - density ${density}`, () => {
    test(`Blank ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
      const { precinctId } = gridLayout;

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
        },
        ballotImagePaths
      );

      assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
      expect(frontResult.interpretation.votes).toEqual({});
      assert(backResult.interpretation.type === 'InterpretedHmpbPage');
      expect(backResult.interpretation.votes).toEqual({});
    });

    test(`Marked ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
      const { precinctId } = gridLayout;

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
        },
        ballotImagePaths
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
  });
}
