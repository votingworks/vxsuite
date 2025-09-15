import { beforeEach, describe, expect, test, vi } from 'vitest';
import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import { assert, assertDefined, find, iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
  allBaseBallotProps,
  createPlaywrightRenderer,
  BaseBallotProps,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
  markBallotDocument,
  createTestVotes,
} from '@votingworks/hmpb';
import {
  AdjudicationReason,
  asSheet,
  HmpbBallotPaperSize,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  PageInterpretation,
  InterpretedHmpbPage,
  SheetOf,
  ImageData,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { createCanvas } from 'canvas';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
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

describe('HMPB - VX Famous Names', () => {
  const {
    electionDefinition,
    precinctId,
    votes,
    blankBallotPath,
    markedBallotPath,
  } = vxFamousNamesFixtures;

  test.each([false, true])(
    'Blank ballot interpretation',
    async (disableBmdBallotScanning) => {
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
          disableBmdBallotScanning,
        },
        images
      );

      assert(frontResult.type === 'InterpretedHmpbPage');
      expect(frontResult.votes).toEqual({
        attorney: [],
        'chief-of-police': [],
        controller: [],
        mayor: [],
        'public-works-director': [],
      });
      assert(backResult.type === 'InterpretedHmpbPage');
      expect(backResult.votes).toEqual({
        'board-of-alderman': [],
        'city-council': [],
        'parks-and-recreation-director': [],
      });

      expect(frontResult.metadata).toEqual({
        source: 'qr-code',
        ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
        precinctId,
        ballotStyleId: election.ballotStyles[0]!.id,
        pageNumber: 1,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
      expect(backResult.metadata).toEqual({
        source: 'qr-code',
        ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
        precinctId,
        ballotStyleId: election.ballotStyles[0]!.id,
        pageNumber: 2,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
    }
  );

  test.each([false, true])(
    'Marked ballot interpretation',
    async (disableBmdBallotScanning) => {
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
          disableBmdBallotScanning,
        },
        images
      );

      assert(frontResult.type === 'InterpretedHmpbPage');
      assert(backResult.type === 'InterpretedHmpbPage');
      expect(
        sortVotesDict({
          ...frontResult.votes,
          ...backResult.votes,
        })
      ).toEqual(sortVotesDict(votes));
    }
  );

  test.each([false, true])(
    'Wrong election',
    async (disableBmdBallotScanning) => {
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
          disableBmdBallotScanning,
        },
        images
      );

      expect(frontResult.type).toEqual('InvalidBallotHashPage');
      expect(backResult.type).toEqual('InvalidBallotHashPage');
    }
  );

  test.each([false, true])(
    'Wrong precinct',
    async (disableBmdBallotScanning) => {
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
          disableBmdBallotScanning,
        },
        images
      );

      expect(frontResult.type).toEqual('InvalidPrecinctPage');
      expect(backResult.type).toEqual('InvalidPrecinctPage');
    }
  );

  test.each([false, true])(
    'Wrong test mode',
    async (disableBmdBallotScanning) => {
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
          disableBmdBallotScanning,
        },
        images
      );

      expect(frontResult.type).toEqual('InvalidTestModePage');
      expect(backResult.type).toEqual('InvalidTestModePage');
    }
  );

  test.each([false, true])(
    'normalizes ballot mode',
    async (disableBmdBallotScanning) => {
      const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

      const options: InterpreterOptions = {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(
          assertDefined(precinctId)
        ),
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
        disableBmdBallotScanning,
      };

      const blankPageInterpretation: PageInterpretation = { type: 'BlankPage' };
      vi.mocked(normalizeBallotMode).mockImplementation(
        (_input, interpreterOptions) => {
          expect(interpreterOptions).toEqual(options);

          return blankPageInterpretation;
        }
      );

      const interpretationResult = await interpretSheet(options, images);
      expect(interpretationResult[0]).toEqual(blankPageInterpretation);
      expect(interpretationResult[1]).toEqual(blankPageInterpretation);
    }
  );

  test.each([false, true])(
    'streaks on ballot',
    async (disableBmdBallotScanning) => {
      const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
      const [frontImage, backImage] = images;
      const canvas = createCanvas(frontImage.width, frontImage.height);
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.putImageData(frontImage, 0, 0);
      context.fillStyle = 'black';
      context.fillRect(canvas.width / 2, 0, 1, canvas.height);
      const streakImage = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(
            assertDefined(precinctId)
          ),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
          disableBmdBallotScanning,
        },
        [streakImage, backImage]
      );

      const streaksInterpretation: PageInterpretation = {
        type: 'UnreadablePage',
        reason: 'verticalStreaksDetected',
      };
      expect(frontResult).toEqual(streaksInterpretation);
      expect(backResult).toEqual(streaksInterpretation);
    }
  );
});

function snapshotWriteInCrops(
  sheetImages: SheetOf<ImageData>,
  sheetInterpretations: SheetOf<InterpretedHmpbPage>
) {
  for (const [pageImage, interpretation] of iter(sheetImages).zip(
    sheetInterpretations
  )) {
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
          context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
      }
    }

    const writeInImage = canvas.toBuffer('image/png');
    expect(writeInImage).toMatchImageSnapshot();
  }
}

function snapshotCandidateOptionCrops(
  sheetImages: SheetOf<ImageData>,
  sheetInterpretations: SheetOf<InterpretedHmpbPage>
) {
  for (const [pageImage, interpretation] of iter(sheetImages).zip(
    sheetInterpretations
  )) {
    // Skip pages without candidate contests
    if (
      !interpretation.layout.contests.some((contest) =>
        contest.options.some(
          (option) =>
            option.definition?.type === 'candidate' &&
            !option.definition.isWriteIn
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
          !option.definition.isWriteIn
        ) {
          const { bounds } = option;
          context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
      }
    }

    const image = canvas.toBuffer('image/png');
    expect(image).toMatchImageSnapshot();
  }
}

function snapshotBallotMeasureCrops(
  sheetImages: SheetOf<ImageData>,
  sheetInterpretations: SheetOf<InterpretedHmpbPage>
) {
  for (const [pageImage, interpretation] of iter(sheetImages).zip(
    sheetInterpretations
  )) {
    // Skip pages without yes-no
    if (
      !interpretation.layout.contests.some((contest) =>
        contest.options.some((option) => option.definition?.type === 'yesno')
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
        if (option.definition?.type === 'yesno') {
          const { bounds } = option;
          context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
      }
    }

    const image = canvas.toBuffer('image/png');
    expect(image).toMatchImageSnapshot();
  }
}

for (const spec of vxGeneralElectionFixtures.fixtureSpecs) {
  describe(`HMPB - VX general election - ${spec.paperSize} paper - language: ${spec.languageCode}`, () => {
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
        .chunksExact(2)
        .enumerate()) {
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

        assert(frontResult.type === 'InterpretedHmpbPage');
        assert(backResult.type === 'InterpretedHmpbPage');
        expect(
          sortVotesDict({
            ...frontResult.votes,
            ...backResult.votes,
          })
        ).toEqual(sortVotesDict(expectedVotes));

        expect(
          sortUnmarkedWriteIns([
            ...(frontResult.unmarkedWriteIns ?? []),
            ...(backResult.unmarkedWriteIns ?? []),
          ])
        ).toEqual(sortUnmarkedWriteIns(expectedUnmarkedWriteIns));

        expect(frontResult.metadata).toEqual({
          source: 'qr-code',
          ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 1,
          isTestMode: false,
          ballotType: BallotType.Absentee,
        });
        expect(backResult.metadata).toEqual({
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
          snapshotWriteInCrops(sheetImages, [frontResult, backResult]);
        }
      }
    });
  });
}

describe('HMPB - VX primary election', () => {
  const { electionDefinition, mammalParty, fishParty } =
    vxPrimaryElectionFixtures;

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

      assert(frontResult.type === 'InterpretedHmpbPage');
      expect(frontResult.votes).toEqual(votesForSheet({}, 1, gridLayout));
      assert(backResult.type === 'InterpretedHmpbPage');
      expect(backResult.votes).toEqual({});

      expect(frontResult.metadata).toEqual({
        source: 'qr-code',
        ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
        precinctId,
        ballotStyleId,
        pageNumber: 1,
        isTestMode: true,
        ballotType: BallotType.Precinct,
      });
      expect(backResult.metadata).toEqual({
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

      assert(frontResult.type === 'InterpretedHmpbPage');
      assert(backResult.type === 'InterpretedHmpbPage');
      expect(
        sortVotesDict({
          ...frontResult.votes,
          ...backResult.votes,
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

    expect(frontResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedPrecincts',
    });
    expect(backResult).toEqual<PageInterpretation>({
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

    expect(frontResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotStyles',
    });
    expect(backResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotStyles',
    });
  });
});

for (const spec of nhGeneralElectionFixtures.fixtureSpecs) {
  describe(`HMPB - NH general election - ${spec.paperSize}${
    spec.allBallotProps[0]!.compact ? ' - compact' : ''
  }`, () => {
    const { electionPath, markedBallotPath, precinctId, ballotStyleId, votes } =
      spec;

    test('Marked ballot interpretation', async () => {
      const electionDefinition = (
        await readElection(electionPath)
      ).unsafeUnwrap();

      const ballotImagePaths = pdfToPageImages(markedBallotPath);
      for await (const [sheetIndex, sheetImages] of iter(ballotImagePaths)
        .chunksExact(2)
        .enumerate()) {
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
          spec.unmarkedWriteIns.map(({ contestId, writeInIndex }) => ({
            contestId,
            optionId: `write-in-${writeInIndex}`,
          })),
          sheetNumber,
          gridLayout
        );

        assert(frontResult.type === 'InterpretedHmpbPage');
        assert(backResult.type === 'InterpretedHmpbPage');
        expect(
          sortVotesDict({
            ...frontResult.votes,
            ...backResult.votes,
          })
        ).toEqual(sortVotesDict(expectedVotes));

        expect(
          sortUnmarkedWriteIns([
            ...(frontResult.unmarkedWriteIns ?? []),
            ...(backResult.unmarkedWriteIns ?? []),
          ])
        ).toEqual(sortUnmarkedWriteIns(expectedUnmarkedWriteIns));

        expect(frontResult.metadata).toEqual({
          source: 'qr-code',
          ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 1,
          isTestMode: false,
          ballotType: BallotType.Precinct,
        });
        expect(backResult.metadata).toEqual({
          source: 'qr-code',
          ballotHash: sliceBallotHashForEncoding(electionDefinition.ballotHash),
          precinctId,
          ballotStyleId,
          pageNumber: sheetIndex * 2 + 2,
          isTestMode: false,
          ballotType: BallotType.Precinct,
        });

        // Snapshot the ballot images with write-in crops drawn on them
        // To save time we don't test across paper sizes.
        if (spec.paperSize === HmpbBallotPaperSize.Letter) {
          snapshotWriteInCrops(sheetImages, [frontResult, backResult]);
        }
      }
    });
  });
}

test('Non-consecutive page numbers', async () => {
  const { electionPath, blankBallotPath } =
    vxGeneralElectionFixtures.fixtureSpecs[0]!;
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

  expect(frontResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'nonConsecutivePageNumbers',
  });
  expect(backResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'nonConsecutivePageNumbers',
  });
});

test('Ballot audit IDs', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const allBallotProps = allBaseBallotProps(election);
  const ballotPropsWithAuditId: BaseBallotProps = {
    ...find(allBallotProps, (p) => p.ballotMode === 'official'),
    ballotAuditId: 'test-ballot-audit-id',
  };
  const renderer = await createPlaywrightRenderer();
  const ballotPdf = (
    await renderAllBallotPdfsAndCreateElectionDefinition(
      renderer,
      ballotTemplates.VxDefaultBallot,
      [ballotPropsWithAuditId],
      'vxf'
    )
  ).ballotPdfs[0]!;
  const images = asSheet(await pdfToPageImages(ballotPdf).toArray());
  expect(images).toHaveLength(2);

  const testMode = ballotPropsWithAuditId.ballotMode === 'test';
  const [frontResult, backResult] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: singlePrecinctSelectionFor(
        ballotPropsWithAuditId.precinctId
      ),
      testMode,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    images
  );

  assert(frontResult.type === 'InterpretedHmpbPage');
  assert(backResult.type === 'InterpretedHmpbPage');
  expect(frontResult.metadata.ballotAuditId).toEqual('test-ballot-audit-id');
  expect(backResult.metadata.ballotAuditId).toEqual('test-ballot-audit-id');
});

describe('Contest option bounds', () => {
  test('Election with ballot measures only', async () => {
    const baseElectionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();
    const { election } = baseElectionDefinition;
    const electionWithMeasureOnly = {
      ...election,
      contests: election.contests.filter((c) => c.type === 'yesno'),
    } as const;

    const ballotProps = allBaseBallotProps(electionWithMeasureOnly);
    const renderer = await createPlaywrightRenderer();
    const { electionDefinition, ballotContents: blankBallotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        renderer,
        ballotTemplates.VxDefaultBallot,
        ballotProps,
        'vxf'
      );

    const ballotDocument = await renderer.loadDocumentFromContent(
      blankBallotContents[0]!
    );
    const { votes } = createTestVotes(electionWithMeasureOnly.contests);
    await renderBallotPdfWithMetadataQrCode(
      ballotProps[0]!,
      ballotDocument,
      electionDefinition
    );

    await markBallotDocument(ballotDocument, votes);
    const markedBallotPdf = await ballotDocument.renderToPdf();
    ballotDocument.cleanup();

    const images = asSheet(await pdfToPageImages(markedBallotPdf).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      images
    );

    assert(frontResult.type === 'InterpretedHmpbPage');
    assert(backResult.type === 'InterpretedHmpbPage');
    snapshotBallotMeasureCrops(images, [frontResult, backResult]);
  });

  test('Election with candidate contests only, no write-ins', async () => {
    const baseElectionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();
    const { election } = baseElectionDefinition;
    const electionWithCandidateContestsOnly = {
      ...election,
      contests: election.contests
        .filter((c) => c.type === 'candidate')
        .map((c) => ({
          ...c,
          allowWriteIns: false,
        })),
    } as const;

    const ballotProps = allBaseBallotProps(electionWithCandidateContestsOnly);
    const renderer = await createPlaywrightRenderer();
    const { electionDefinition, ballotContents: blankBallotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        renderer,
        ballotTemplates.VxDefaultBallot,
        ballotProps,
        'vxf'
      );

    const ballotDocument = await renderer.loadDocumentFromContent(
      blankBallotContents[0]!
    );
    const { votes } = createTestVotes(
      electionWithCandidateContestsOnly.contests
    );
    await renderBallotPdfWithMetadataQrCode(
      ballotProps[0]!,
      ballotDocument,
      electionDefinition
    );

    await markBallotDocument(ballotDocument, votes);
    const markedBallotPdf = await ballotDocument.renderToPdf();
    ballotDocument.cleanup();

    const images = asSheet(await pdfToPageImages(markedBallotPdf).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      images
    );

    assert(frontResult.type === 'InterpretedHmpbPage');
    assert(backResult.type === 'InterpretedHmpbPage');
    snapshotCandidateOptionCrops(images, [frontResult, backResult]);
  });
});
