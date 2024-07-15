import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from '@votingworks/hmpb';
import { loadImageData } from '@votingworks/image-utils';
import { mockOf } from '@votingworks/test-utils';
import {
  AdjudicationReason,
  BallotPaperSize,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  PageInterpretation,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { createCanvas } from 'canvas';
import {
  pdfToPageImagePaths,
  sortUnmarkedWriteIns,
  sortVotesDict,
  unmarkedWriteInsForSheet,
  votesForSheet,
} from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';
import { InterpreterOptions } from './types';
import { normalizeBallotMode } from './validation';

jest.mock('./validation');

beforeEach(() => {
  mockOf(normalizeBallotMode).mockImplementation((input) => input);
});

describe('HMPB - Famous Names', () => {
  const { electionPath, precinctId, votes, blankBallotPath, markedBallotPath } =
    famousNamesFixtures;
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  });

  test('Blank ballot interpretation', async () => {
    const { election } = electionDefinition;
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    expect(ballotImagePaths).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          assertDefined(precinctId)
        ),
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
      'public-works-director': [],
    });
    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({
      'board-of-alderman': [],
      'city-council': [],
      'parks-and-recreation-director': [],
    });

    expect(frontResult.interpretation.metadata).toEqual({
      source: 'qr-code',
      ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
      precinctId,
      ballotStyleId: election.ballotStyles[0]!.id,
      pageNumber: 1,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    });
    expect(backResult.interpretation.metadata).toEqual({
      source: 'qr-code',
      ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
      precinctId,
      ballotStyleId: election.ballotStyles[0]!.id,
      pageNumber: 2,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    });
  });

  test('Marked ballot interpretation', async () => {
    const ballotImagePaths = await pdfToPageImagePaths(markedBallotPath);
    expect(ballotImagePaths).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          assertDefined(precinctId)
        ),
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
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    expect(ballotImagePaths).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          ballotHash: 'wrong ballot hash',
        },
        precinctSelection: singlePrecinctSelectionFor(
          assertDefined(precinctId)
        ),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidBallotHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidBallotHashPage');
  });

  test('Wrong precinct', async () => {
    const { election } = electionDefinition;
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    expect(ballotImagePaths).toHaveLength(2);
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
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    expect(ballotImagePaths).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          assertDefined(precinctId)
        ),
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      ballotImagePaths as [string, string]
    );

    expect(frontResult.interpretation.type).toEqual('InvalidTestModePage');
    expect(backResult.interpretation.type).toEqual('InvalidTestModePage');
  });

  test('normalizes ballot mode', async () => {
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    expect(ballotImagePaths).toHaveLength(2);

    const options: InterpreterOptions = {
      electionDefinition,
      precinctSelection: singlePrecinctSelectionFor(assertDefined(precinctId)),
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    };

    const blankPageInterpretation: PageInterpretation = { type: 'BlankPage' };
    mockOf(normalizeBallotMode).mockImplementation(
      (_input, interpreterOptions) => {
        expect(interpreterOptions).toEqual(options);

        return blankPageInterpretation;
      }
    );

    const interpretationResult = await interpretSheet(
      options,
      ballotImagePaths as [string, string]
    );
    expect(interpretationResult[0].interpretation).toEqual(
      blankPageInterpretation
    );
    expect(interpretationResult[1].interpretation).toEqual(
      blankPageInterpretation
    );
  });
});

for (const spec of generalElectionFixtures.fixtureSpecs) {
  describe(`HMPB - general election - ${spec.paperSize} paper - language: ${spec.languageCode}`, () => {
    const {
      electionPath,
      markedBallotPath,
      precinctId,
      ballotStyleId,
      votes,
      unmarkedWriteIns,
    } = spec;

    test(`Marked ballot interpretation`, async () => {
      const electionDefinition = (
        await readElection(electionPath)
      ).unsafeUnwrap();

      const ballotImagePaths = await pdfToPageImagePaths(markedBallotPath);
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
        const gridLayout = electionDefinition.election.gridLayouts!.find(
          (layout) => layout.ballotStyleId === ballotStyleId
        )!;
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
          ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 1,
          isTestMode: false,
          ballotType: BallotType.Absentee,
        });
        expect(backResult.interpretation.metadata).toEqual({
          source: 'qr-code',
          ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 2,
          isTestMode: false,
          ballotType: BallotType.Absentee,
        });

        // Snapshot the ballot images with write-in crops drawn on them
        // To save time we don't test across paper sizes.
        if (spec.paperSize === BallotPaperSize.Letter) {
          for (const [pageImagePath, interpretation] of iter(
            sheetImagePaths
          ).zip([frontResult.interpretation, backResult.interpretation])) {
            // Skip pages without write-ins
            if (
              !interpretation.layout.contests.some((contest) =>
                contest.options.some(
                  (option) =>
                    option.definition?.type === 'candidate' &&
                    option.definition.isWriteIn
                )
              )
            ) {
              continue;
            }
            const ballotImage = await loadImageData(pageImagePath);
            const canvas = createCanvas(ballotImage.width, ballotImage.height);
            const context = canvas.getContext('2d');
            context.imageSmoothingEnabled = false;
            context.putImageData(ballotImage, 0, 0);
            context.strokeStyle = 'blue';
            context.lineWidth = 2;

            for (const contest of interpretation.layout.contests) {
              for (const option of contest.options) {
                if (
                  option.definition?.type === 'candidate' &&
                  option.definition.isWriteIn
                ) {
                  const { bounds } = option;
                  context.strokeRect(
                    bounds.x,
                    bounds.y,
                    bounds.width,
                    bounds.height
                  );
                }
              }
            }

            const writeInImage = canvas.toBuffer('image/png');
            expect(writeInImage).toMatchImageSnapshot();
          }
        }
      }
    });
  });
}

describe('HMPB - primary election', () => {
  const { electionPath, mammalParty, fishParty } = primaryElectionFixtures;
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  });

  for (const [partyLabel, partyFixtures] of Object.entries({
    mammalParty,
    fishParty,
  })) {
    const {
      blankBallotPath,
      markedBallotPath,
      precinctId,
      ballotStyleId,
      votes,
    } = partyFixtures;

    test(`${partyLabel} - Blank ballot interpretation`, async () => {
      const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
      expect(ballotImagePaths).toHaveLength(2);

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

      const gridLayout = electionDefinition.election.gridLayouts!.find(
        (layout) => layout.ballotStyleId === ballotStyleId
      )!;

      assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
      expect(frontResult.interpretation.votes).toEqual(
        votesForSheet({}, 1, gridLayout)
      );
      assert(backResult.interpretation.type === 'InterpretedHmpbPage');
      expect(backResult.interpretation.votes).toEqual({});

      expect(frontResult.interpretation.metadata).toEqual({
        source: 'qr-code',
        ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
        precinctId,
        ballotStyleId,
        pageNumber: 1,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
      expect(backResult.interpretation.metadata).toEqual({
        source: 'qr-code',
        ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
        precinctId,
        ballotStyleId,
        pageNumber: 2,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
    });

    test(`${partyLabel} - Marked ballot interpretation`, async () => {
      const ballotImagePaths = await pdfToPageImagePaths(markedBallotPath);
      expect(ballotImagePaths).toHaveLength(2);

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

  test('Mismatched precincts on front and back', async () => {
    const precinct1Paths = await pdfToPageImagePaths(
      mammalParty.blankBallotPath
    );
    const precinct2Paths = await pdfToPageImagePaths(
      mammalParty.otherPrecinctBlankBallotPath
    );
    expect(precinct1Paths).toHaveLength(2);
    expect(precinct2Paths).toHaveLength(2);
    const [frontPath] = precinct1Paths;
    const [, backPath] = precinct2Paths;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontPath, backPath] as [string, string]
    );

    expect(frontResult.interpretation).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedPrecincts',
    });
    expect(backResult.interpretation).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedPrecincts',
    });
  });

  test('Mismatched ballot styles on front and back', async () => {
    const ballotStyle1Paths = await pdfToPageImagePaths(
      mammalParty.blankBallotPath
    );
    const ballotStyle2Paths = await pdfToPageImagePaths(
      fishParty.blankBallotPath
    );
    expect(ballotStyle1Paths).toHaveLength(2);
    expect(ballotStyle2Paths).toHaveLength(2);
    const [frontPath] = ballotStyle1Paths;
    const [, backPath] = ballotStyle2Paths;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontPath, backPath] as [string, string]
    );

    expect(frontResult.interpretation).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotStyles',
    });
    expect(backResult.interpretation).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotStyles',
    });
  });
});

test('Non-consecutive page numbers', async () => {
  const { electionPath, blankBallotPath } =
    generalElectionFixtures.fixtureSpecs[0]!;
  const electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
  assert(ballotImagePaths.length > 2);
  const [frontPath, , backPath] = ballotImagePaths;

  const [frontResult, backResult] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    [frontPath, backPath] as [string, string]
  );

  expect(frontResult.interpretation).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'nonConsecutivePageNumbers',
  });
  expect(backResult.interpretation).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'nonConsecutivePageNumbers',
  });
});
