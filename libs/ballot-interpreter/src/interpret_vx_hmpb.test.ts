import { assert, iter } from '@votingworks/basics';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  famousNamesFixtures,
  primaryElectionFixtures,
  generalElectionFixtures,
} from '@votingworks/hmpb-render-backend';
import {
  AdjudicationReason,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
} from '@votingworks/types';
import { sliceElectionHash } from '@votingworks/ballot-encoder';
import {
  sortVotesDict,
  ballotPdfToPageImages,
  votesForSheet,
  sortUnmarkedWriteIns,
  unmarkedWriteInsForSheet,
} from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

describe('HMPB - Famous Names', () => {
  const {
    electionDefinition,
    precinctId,
    votes,
    blankBallotPath,
    markedBallotPath,
  } = famousNamesFixtures;
  const { election } = electionDefinition;

  test('Blank ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({
      attorney: [],
      'chief-of-police': [],
      controller: [],
      mayor: [],
      'parks-and-recreation-director': [],
      'public-works-director': [],
    });
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({
      'board-of-alderman': [],
      'city-council': [],
    });

    expect(frontResult.interpretation.metadata).toEqual({
      source: 'qr-code',
      electionHash: sliceElectionHash(electionDefinition.electionHash),
      precinctId,
      ballotStyleId: election.ballotStyles[0]!.id,
      pageNumber: 1,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    });
    expect(backResult.interpretation.metadata).toEqual({
      source: 'qr-code',
      electionHash: sliceElectionHash(electionDefinition.electionHash),
      precinctId,
      ballotStyleId: election.ballotStyles[0]!.id,
      pageNumber: 2,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    });
  });

  test('Marked ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
    expect(ballotImagePaths.length).toEqual(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
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

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          electionHash: 'wrong election hash',
        },
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidElectionHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidElectionHashPage');
  });

  test('Wrong precinct', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);
    assert(precinctId !== election.precincts[1]!.id);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          election.precincts[1]!.id
        ),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidPrecinctPage');
    expect(backResult.interpretation.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    expect(ballotImagePaths.length).toEqual(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidTestModePage');
    expect(backResult.interpretation.type).toEqual('InvalidTestModePage');
  });
});

for (const {
  bubblePosition,
  paperSize,
  density,
  electionDefinition,
  precinctId,
  ballotStyleId,
  gridLayout,
  votes,
  unmarkedWriteIns,
  markedBallotPath,
} of generalElectionFixtures) {
  describe(`HMPB - general election - bubbles on ${bubblePosition} - ${paperSize} paper - density ${density}`, () => {
    test(`Marked ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);

      for (const [sheetIndex, sheetImagePaths] of iter(ballotImagePaths)
        .chunks(2)
        .enumerate()) {
        assert(sheetImagePaths.length === 2);
        const [frontResult, backResult] = await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: false,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
            adjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
          },
          sheetImagePaths
        );

        const sheetNumber = sheetIndex + 1;
        const expectedVotes = votesForSheet(votes, sheetNumber, gridLayout);
        const expectedUnmarkedWriteIns = unmarkedWriteInsForSheet(
          unmarkedWriteIns.map(({ contestId, writeInIndex }) => ({
            contestId,
            optionId: `write-in-${writeInIndex}`,
          })),
          sheetNumber,
          gridLayout
        );

        assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
        assert(backResult.interpretation.type === 'InterpretedHmpbPage');
        expect(
          sortVotesDict({
            ...frontResult.interpretation.votes,
            ...backResult.interpretation.votes,
          })
        ).toEqual(sortVotesDict(expectedVotes));

        expect(
          sortUnmarkedWriteIns([
            ...(frontResult.interpretation.unmarkedWriteIns ?? []),
            ...(backResult.interpretation.unmarkedWriteIns ?? []),
          ])
        ).toEqual(sortUnmarkedWriteIns(expectedUnmarkedWriteIns));

        expect(frontResult.interpretation.metadata).toEqual({
          source: 'qr-code',
          electionHash: sliceElectionHash(electionDefinition.electionHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 1,
          isTestMode: false,
          ballotType: BallotType.Absentee,
        });
        expect(backResult.interpretation.metadata).toEqual({
          source: 'qr-code',
          electionHash: sliceElectionHash(electionDefinition.electionHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 2,
          isTestMode: false,
          ballotType: BallotType.Absentee,
        });
      }
    });
  });
}

describe('HMPB - primary election', () => {
  const { electionDefinition, mammalParty, fishParty } =
    primaryElectionFixtures;

  for (const partyFixtures of [mammalParty, fishParty]) {
    const {
      partyLabel,
      blankBallotPath,
      markedBallotPath,
      precinctId,
      votes,
      gridLayout,
    } = partyFixtures;
    const { ballotStyleId } = gridLayout;

    test(`${partyLabel} - Blank ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
      expect(ballotImagePaths.length).toEqual(2);

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
        },
        ballotImagePaths as [string, string]
      );

      assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
      expect(frontResult.interpretation.votes).toEqual(
        votesForSheet({}, 1, gridLayout)
      );
      assert(backResult.interpretation.type === 'InterpretedHmpbPage');
      expect(backResult.interpretation.votes).toEqual({});

      expect(frontResult.interpretation.metadata).toEqual({
        source: 'qr-code',
        electionHash: sliceElectionHash(electionDefinition.electionHash),
        precinctId,
        ballotStyleId,
        pageNumber: 1,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
      expect(backResult.interpretation.metadata).toEqual({
        source: 'qr-code',
        electionHash: sliceElectionHash(electionDefinition.electionHash),
        precinctId,
        ballotStyleId,
        pageNumber: 2,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
    });

    test(`${partyLabel} - Marked ballot interpretation`, async () => {
      const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
      expect(ballotImagePaths.length).toEqual(2);

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
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
  }
});
