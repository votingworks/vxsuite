import { beforeEach, describe, expect, test, vi } from 'vitest';
import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import { assert, assertDefined, find, iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
  miGeneralElectionFixtures,
  allBaseBallotProps,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
  markBallotDocument,
  createTestVotes,
  createPlaywrightRendererPool,
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
  BaseBallotProps,
  ElectionDefinition,
  getBallotStyle,
  gridPositionsFromBallotPositions,
  LATEST_SOFTWARE_VERSION,
} from '@votingworks/types';
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
  const { electionDefinition, votes, blankBallotPath, markedBallotPath } =
    vxFamousNamesFixtures;
  const precinctId = assertDefined(vxFamousNamesFixtures.precinctId);

  test('Blank ballot interpretation', async () => {
    const { election } = electionDefinition;
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: new Set([precinctId]),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
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
  });

  test('Marked ballot interpretation', async () => {
    const images = asSheet(await pdfToPageImages(markedBallotPath).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: new Set([precinctId]),
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

  test('Wrong election', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition: {
          ...electionDefinition,
          // Valid-hex but deliberately wrong hash.
          ballotHash: 'f'.repeat(64),
        },
        validPrecinctIds: new Set([precinctId]),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      images
    );

    expect(frontResult.type).toEqual('InvalidBallotHashPage');
    expect(backResult.type).toEqual('InvalidBallotHashPage');
  });

  test('Wrong precinct', async () => {
    const { election } = electionDefinition;
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    assert(precinctId !== election.precincts[1]!.id);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: new Set([election.precincts[1]!.id]),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      images
    );

    expect(frontResult.type).toEqual('InvalidPrecinctPage');
    expect(backResult.type).toEqual('InvalidPrecinctPage');
  });

  test('Wrong test mode', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: new Set([precinctId]),
        testMode: false,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      images
    );

    expect(frontResult.type).toEqual('InvalidTestModePage');
    expect(backResult.type).toEqual('InvalidTestModePage');
  });

  test('normalizes ballot mode', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());

    const options: InterpreterOptions = {
      electionDefinition,
      validPrecinctIds: new Set([precinctId]),
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
    expect(interpretationResult[0]).toEqual(blankPageInterpretation);
    expect(interpretationResult[1]).toEqual(blankPageInterpretation);
  });

  test('streaks on ballot', async () => {
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    const [frontImage, backImage] = images;
    const canvas = createCanvas(frontImage.width, frontImage.height);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.putImageData(frontImage, 0, 0);
    context.fillStyle = 'black';
    // Make a giant vertical streak that will trigger the cumulative streak threshold
    context.fillRect(canvas.width / 2, 0, 6, canvas.height);
    const streakImage = context.getImageData(0, 0, canvas.width, canvas.height);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: new Set([precinctId]),
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
    expect(frontResult).toEqual(streaksInterpretation);
    expect(backResult).toEqual(streaksInterpretation);
  });
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
            validPrecinctIds: new Set([precinctId]),
            testMode: false,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
            adjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
          },
          sheetImages
        );

        const sheetNumber = sheetIndex + 1;
        const gridPositions = gridPositionsFromBallotPositions(
          assertDefined(
            getBallotStyle({
              election: electionDefinition.election,
              ballotStyleId,
            })?.ballotPositions
          )
        );
        const expectedVotes = votesForSheet(votes, sheetNumber, gridPositions);
        const expectedUnmarkedWriteIns = unmarkedWriteInsForSheet(
          unmarkedWriteIns.map(({ contestId, writeInIndex }) => ({
            contestId,
            optionId: `write-in-${writeInIndex}`,
          })),
          sheetNumber,
          gridPositions
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
          validPrecinctIds: new Set([precinctId]),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
        },
        images
      );

      const gridPositions = gridPositionsFromBallotPositions(
        assertDefined(
          getBallotStyle({
            election: electionDefinition.election,
            ballotStyleId,
          })?.ballotPositions
        )
      );

      assert(frontResult.type === 'InterpretedHmpbPage');
      expect(frontResult.votes).toEqual(votesForSheet({}, 1, gridPositions));
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
          validPrecinctIds: new Set([precinctId]),
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
        validPrecinctIds: allPrecinctIds(electionDefinition),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontImage, backImage]
    );

    expect(frontResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotMetadata',
    });
    expect(backResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotMetadata',
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
        validPrecinctIds: allPrecinctIds(electionDefinition),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [frontImage, backImage]
    );

    expect(frontResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotMetadata',
    });
    expect(backResult).toEqual<PageInterpretation>({
      type: 'UnreadablePage',
      reason: 'mismatchedBallotMetadata',
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
            validPrecinctIds: new Set([precinctId]),
            testMode: false,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
            adjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
          },
          sheetImages
        );

        const sheetNumber = sheetIndex + 1;
        const gridPositions = gridPositionsFromBallotPositions(
          assertDefined(
            getBallotStyle({
              election: electionDefinition.election,
              ballotStyleId,
            })?.ballotPositions
          )
        );
        const expectedVotes = votesForSheet(votes, sheetNumber, gridPositions);
        const expectedUnmarkedWriteIns = unmarkedWriteInsForSheet(
          spec.unmarkedWriteIns.map(({ contestId, writeInIndex }) => ({
            contestId,
            optionId: `write-in-${writeInIndex}`,
          })),
          sheetNumber,
          gridPositions
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

describe('HMPB - MI general election (straight party contest)', () => {
  const { electionPath, markedBallotPath, precinctId, ballotStyleId, votes } =
    miGeneralElectionFixtures;

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
          validPrecinctIds: new Set([precinctId]),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
        },
        sheetImages
      );

      const sheetNumber = sheetIndex + 1;
      const gridPositions = gridPositionsFromBallotPositions(
        assertDefined(
          getBallotStyle({
            election: electionDefinition.election,
            ballotStyleId,
          })?.ballotPositions
        )
      );
      const expectedVotes = votesForSheet(votes, sheetNumber, gridPositions);

      assert(frontResult.type === 'InterpretedHmpbPage');
      assert(backResult.type === 'InterpretedHmpbPage');
      expect(
        sortVotesDict({ ...frontResult.votes, ...backResult.votes })
      ).toEqual(sortVotesDict(expectedVotes));
    }
  });
});

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
      validPrecinctIds: allPrecinctIds(electionDefinition),
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    [frontImage!, backImage!]
  );

  expect(frontResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'mismatchedBallotMetadata',
  });
  expect(backResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'mismatchedBallotMetadata',
  });
});

// Defense-in-depth check for issue #8426. The Rust hash check is the primary
// gate against scanning a ballot whose physical grid doesn't match the
// configured election's gridLayouts. If a ballot somehow gets past the hash
// gate while still failing the gridLayout-shape invariant — e.g. someone hand-
// crafted an election whose hash matches but whose gridLayouts overshoot the
// ballot — Rust now surfaces a typed `gridPositionOutsideTimingMarkGrid`
// error instead of silently dropping gridPositions and crashing in TS's
// `getAllPossibleAdjudicationReasons`. This test spoofs the ballot hash so
// that the second-layer check is actually exercised.
test('Spoofed-hash ballot whose grid exceeds detected timing-mark grid is rejected', async () => {
  const letterSpec = find(
    vxGeneralElectionFixtures.fixtureSpecs,
    (s) => s.paperSize === HmpbBallotPaperSize.Letter && s.languageCode === 'en'
  );
  const longerSpec = find(
    vxGeneralElectionFixtures.fixtureSpecs,
    (s) =>
      s.paperSize === HmpbBallotPaperSize.Custom17 && s.languageCode === 'en'
  );

  const letterDef = (
    await readElection(letterSpec.electionPath)
  ).unsafeUnwrap();
  const longerDef = (
    await readElection(longerSpec.electionPath)
  ).unsafeUnwrap();
  // Take just the first sheet — the letter ballot may have multiple sheets.
  const letterImages = asSheet(
    await pdfToPageImages(letterSpec.blankBallotPath).take(2).toArray()
  );

  // Use the 17"-tall election's contests/gridLayouts (so positions extend
  // past where letter timing-mark grids can reach), but carry the letter
  // election's hash so the Rust hash check accepts the ballot.
  const spoofed: ElectionDefinition = {
    ...longerDef,
    ballotHash: letterDef.ballotHash,
  };

  const [frontResult, backResult] = await interpretSheet(
    {
      electionDefinition: spoofed,
      validPrecinctIds: allPrecinctIds(spoofed),
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    letterImages
  );

  expect(frontResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'gridPositionOutsideTimingMarkGrid',
  });
  expect(backResult).toEqual<PageInterpretation>({
    type: 'UnreadablePage',
    reason: 'gridPositionOutsideTimingMarkGrid',
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
  const rendererPool = await createPlaywrightRendererPool();
  const { ballotPdfs, electionDefinition: electionDefinitionModified } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      [ballotPropsWithAuditId],
      { format: 'vxf', version: LATEST_SOFTWARE_VERSION }
    );
  const ballotPdf = ballotPdfs[0]!;
  await rendererPool.close();
  const images = asSheet(await pdfToPageImages(ballotPdf).toArray());
  expect(images).toHaveLength(2);

  const testMode = ballotPropsWithAuditId.ballotMode === 'test';
  const [frontResult, backResult] = await interpretSheet(
    {
      electionDefinition: electionDefinitionModified,
      validPrecinctIds: new Set([ballotPropsWithAuditId.precinctId]),
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
    const rendererPool = await createPlaywrightRendererPool();
    const { electionDefinition, ballotContents: blankBallotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        ballotTemplates.VxDefaultBallot,
        ballotProps,
        { format: 'vxf', version: LATEST_SOFTWARE_VERSION }
      );

    const markedBallotPdf = await rendererPool.runTask(async (renderer) => {
      const ballotDocument = await renderer.loadDocumentFromContent(
        blankBallotContents[0]!
      );
      const { votes } = createTestVotes(electionWithMeasureOnly.contests);
      await renderBallotPdfWithMetadataQrCode(
        ballotProps[0]!,
        ballotDocument,
        electionDefinition,
        LATEST_SOFTWARE_VERSION
      );

      await markBallotDocument(ballotDocument, votes);
      return ballotDocument.renderToPdf();
    });
    await rendererPool.close();

    const images = asSheet(await pdfToPageImages(markedBallotPdf).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: allPrecinctIds(electionDefinition),
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
    const rendererPool = await createPlaywrightRendererPool();
    const { electionDefinition, ballotContents: blankBallotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        ballotTemplates.VxDefaultBallot,
        ballotProps,
        { format: 'vxf', version: LATEST_SOFTWARE_VERSION }
      );

    const markedBallotPdf = await rendererPool.runTask(async (renderer) => {
      const ballotDocument = await renderer.loadDocumentFromContent(
        blankBallotContents[0]!
      );
      const { votes } = createTestVotes(
        electionWithCandidateContestsOnly.contests
      );
      await renderBallotPdfWithMetadataQrCode(
        ballotProps[0]!,
        ballotDocument,
        electionDefinition,
        LATEST_SOFTWARE_VERSION
      );

      await markBallotDocument(ballotDocument, votes);
      return ballotDocument.renderToPdf();
    });
    await rendererPool.close();

    const images = asSheet(await pdfToPageImages(markedBallotPdf).toArray());
    expect(images).toHaveLength(2);

    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        validPrecinctIds: allPrecinctIds(electionDefinition),
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

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}
