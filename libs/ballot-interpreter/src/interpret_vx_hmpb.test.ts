import { beforeEach, describe, expect, test, vi } from 'vitest';
import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from '@votingworks/hmpb';
import {
  AdjudicationReason,
  asSheet,
  HmpbBallotPaperSize,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  PageInterpretation,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { createCanvas } from 'canvas';
import {
  pdfToPageImages,
  sortUnmarkedWriteIns,
  sortVotesDict,
  unmarkedWriteInsForSheet,
  votesForSheet,
} from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';
import { InterpreterOptions } from './types';
import { normalizeBallotMode } from './validation';

vi.mock('./validation');

beforeEach(() => {
  vi.mocked(normalizeBallotMode).mockImplementation((input) => input);
});

describe('HMPB - Famous Names', () => {
  const {
    electionDefinition,
    precinctId,
    votes,
    blankBallotPath,
    markedBallotPath,
  } = famousNamesFixtures;

  test('Blank ballot interpretation', async () => {
    const { election } = electionDefinition;
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    expect(images).toHaveLength(2);

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
      images
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
    const images = asSheet(await pdfToPageImages(markedBallotPath).toArray());
    expect(images).toHaveLength(2);

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
      images
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
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

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
      images
    );

    expect(frontResult.interpretation.type).toEqual('InvalidBallotHashPage');
    expect(backResult.interpretation.type).toEqual('InvalidBallotHashPage');
  });

  test('Wrong precinct', async () => {
    const { election } = electionDefinition;
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
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
      images
    );

    expect(frontResult.interpretation.type).toEqual('InvalidPrecinctPage');
    expect(backResult.interpretation.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

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
      images
    );

    expect(frontResult.interpretation.type).toEqual('InvalidTestModePage');
    expect(backResult.interpretation.type).toEqual('InvalidTestModePage');
  });

  test('normalizes ballot mode', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

    const options: InterpreterOptions = {
      electionDefinition,
      precinctSelection: singlePrecinctSelectionFor(assertDefined(precinctId)),
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    };

    const blankPageInterpretation: PageInterpretation = { type: 'BlankPage' };
    vi.mocked(normalizeBallotMode).mockImplementation(
      (_input, interpreterOptions) => {
        expect(interpreterOptions).toEqual(options);

        return blankPageInterpretation;
      }
    );

    const interpretationResult = await interpretSheet(options, images);
    expect(interpretationResult[0].interpretation).toEqual(
      blankPageInterpretation
    );
    expect(interpretationResult[1].interpretation).toEqual(
      blankPageInterpretation
    );
  });

  test('streaks on ballot', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    const [frontImage, backImage] = images;
    const canvas = createCanvas(frontImage.width, frontImage.height);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.putImageData(frontImage, 0, 0);
    context.fillStyle = 'black';
    context.fillRect(canvas.width / 2, 0, 1, canvas.height);
    const streakImage = context.getImageData(0, 0, canvas.width, canvas.height);

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
      [streakImage, backImage]
    );

    const streaksInterpretation: PageInterpretation = {
      type: 'UnreadablePage',
      reason: 'verticalStreaksDetected',
    };
    expect(frontResult.interpretation).toEqual(streaksInterpretation);
    expect(backResult.interpretation).toEqual(streaksInterpretation);
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

      const ballotImagePaths = pdfToPageImages(markedBallotPath);
      for await (const [sheetIndex, sheetImages] of iter(ballotImagePaths)
        .chunks(2)
        .enumerate()) {
        assert(sheetImages.length === 2);
        const [frontResult, backResult] = await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: false,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
            adjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
          },
          sheetImages
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
        if (spec.paperSize === HmpbBallotPaperSize.Letter) {
          for (const [pageImage, interpretation] of iter(sheetImages).zip([
            frontResult.interpretation,
            backResult.interpretation,
          ])) {
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
            const canvas = createCanvas(pageImage.width, pageImage.height);
            const context = canvas.getContext('2d');
            context.imageSmoothingEnabled = false;
            context.putImageData(pageImage, 0, 0);
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
  const { electionDefinition, mammalParty, fishParty } =
    primaryElectionFixtures;

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
      const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
        },
        images
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
      const images = asSheet(await pdfToPageImages(markedBallotPath).toArray());

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
        },
        images
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
    const precinct1Images = asSheet(
      await pdfToPageImages(mammalParty.blankBallotPath).toArray()
    );
    const precinct2Images = asSheet(
      await pdfToPageImages(mammalParty.otherPrecinctBlankBallotPath).toArray()
    );
    const [frontImage] = precinct1Images;
    const [, backImage] = precinct2Images;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontImage, backImage]
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
    const ballotStyle1Images = asSheet(
      await pdfToPageImages(mammalParty.blankBallotPath).toArray()
    );
    const ballotStyle2Images = asSheet(
      await pdfToPageImages(fishParty.blankBallotPath).toArray()
    );
    const [frontImage] = ballotStyle1Images;
    const [, backImage] = ballotStyle2Images;

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontImage, backImage]
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
  const images = await pdfToPageImages(blankBallotPath).toArray();
  assert(images.length > 2);
  const [frontImage, , backImage] = images;

  const [frontResult, backResult] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    [frontImage!, backImage!]
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
