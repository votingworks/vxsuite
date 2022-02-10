import {
  BallotType,
  Candidate,
  CandidateVote,
  Contests,
  ElectionDefinition,
  err,
  GridLayout,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  MarkInfo,
  MarkThresholds,
  ok,
  PageInterpretationWithFiles,
  Result,
  safeParse,
  VotesDict,
} from '@votingworks/types';
import { assert, find } from '@votingworks/utils';
import makeDebug from 'debug';
import {
  BallotCardGeometry,
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
  findTimingMarks,
  getBallotScanOvalImage,
  getScannedBallotCardGeometry,
  scanForTimingMarksByScoringBlocks,
} from './accuvote';
import { Debugger, withSvgDebugger } from './debug';
import {
  binarize,
  matchTemplateImage,
  readGrayscaleImage,
  scoreTemplateMatch,
  simpleRemoveNoise,
} from './images';
import {
  computeTimingMarkGrid,
  decodeBottomRowTimingMarks,
  interpolateMissingTimingMarks,
} from './timing_marks';
import {
  BackMarksMetadataSchema,
  FrontMarksMetadataSchema,
  InterpretedOvalMark,
  PartialTimingMarks,
  ScannedBallotBackPageLayout,
  ScannedBallotFrontPageLayout,
  ScannedBallotPageLayout,
} from './types';
import { loc, makeRect, vec } from './utils';

const dbg = makeDebug('ballot-interpreter-nh:interpret');

/**
 * Finds timing marks in a ballot image.
 */
export function findBallotTimingMarks(
  imageData: ImageData,
  { geometry, debug }: { geometry: BallotCardGeometry; debug?: Debugger }
): PartialTimingMarks | undefined {
  const rects = scanForTimingMarksByScoringBlocks(imageData, {
    minimumScore: 0.75,
    debug,
  });
  return findTimingMarks({
    geometry,
    rects,
    debug,
  });
}

/**
 * Find timing marks in a ballot image and read their metadata.
 */
export function interpretPageLayout(
  imageData: ImageData,
  { geometry, debug }: { geometry: BallotCardGeometry; debug?: Debugger }
): ScannedBallotPageLayout | undefined {
  const partialMarks = findBallotTimingMarks(imageData, {
    geometry,
    debug,
  });

  if (!partialMarks) {
    return undefined;
  }

  const completeMarks = interpolateMissingTimingMarks(partialMarks, { debug });

  if (!completeMarks) {
    return undefined;
  }

  const frontMarkBits = decodeBottomRowTimingMarks(partialMarks);

  if (!frontMarkBits) {
    return undefined;
  }

  const decodedFrontMarks = decodeFrontTimingMarkBits(
    [...frontMarkBits].reverse()
  );
  const decodedBackMarks = decodeBackTimingMarkBits(
    [...frontMarkBits].reverse()
  );

  if (
    decodedFrontMarks &&
    safeParse(FrontMarksMetadataSchema, decodedFrontMarks).isOk()
  ) {
    return {
      side: 'front',
      metadata: decodedFrontMarks,
      partialMarks,
      completeMarks,
    };
  }

  if (
    decodedBackMarks &&
    safeParse(BackMarksMetadataSchema, decodedBackMarks).isOk()
  ) {
    return {
      side: 'back',
      metadata: decodedBackMarks,
      partialMarks,
      completeMarks,
    };
  }

  return undefined;
}

/**
 * Interprets a ballot scan page's oval marks.
 */
export function interpretOvalMarks(
  geometry: BallotCardGeometry,
  ovalTemplate: ImageData,
  frontImageData: ImageData,
  backImageData: ImageData,
  frontLayout: ScannedBallotFrontPageLayout,
  backLayout: ScannedBallotBackPageLayout,
  gridLayout: GridLayout
): InterpretedOvalMark[] {
  const ovalMask = binarize(ovalTemplate);
  const frontGrid = computeTimingMarkGrid(frontLayout.completeMarks);
  const backGrid = computeTimingMarkGrid(backLayout.completeMarks);

  return gridLayout.gridPositions.map<InterpretedOvalMark>((gridPosition) => {
    const [imageData, grid] =
      gridPosition.side === 'front'
        ? [frontImageData, frontGrid]
        : [backImageData, backGrid];

    const ovalCenter = grid.rows[gridPosition.row]?.[gridPosition.column];
    assert(
      ovalCenter,
      `Missing oval center for side=${gridPosition.side}, column=${
        gridPosition.column
      }, row=${gridPosition.row}, contestId=${gridPosition.contestId} ${
        gridPosition.type === 'option'
          ? `optionId=${gridPosition.optionId}`
          : `writeInIndex=${gridPosition.writeInIndex}`
      }`
    );

    const ovalTopLeftPoint = loc(
      Math.floor(ovalCenter.x - geometry.ovalSize.width / 2),
      Math.floor(ovalCenter.y - geometry.ovalSize.height / 2)
    );
    let minimumScore = 1;
    let minimumScoreRect = makeRect({
      minX: ovalTopLeftPoint.x,
      minY: ovalTopLeftPoint.y,
      maxX: ovalTopLeftPoint.x + geometry.ovalSize.width - 1,
      maxY: ovalTopLeftPoint.y + geometry.ovalSize.height - 1,
    });
    let minimumScoredOffset = vec(0, 0);
    for (let xOffset = -3; xOffset <= 3; xOffset += 1) {
      for (let yOffset = -3; yOffset <= 3; yOffset += 1) {
        const x = ovalTopLeftPoint.x + xOffset;
        const y = ovalTopLeftPoint.y + yOffset;
        const ovalRect = makeRect({
          minX: x,
          minY: y,
          maxX: x + geometry.ovalSize.width - 1,
          maxY: y + geometry.ovalSize.height - 1,
        });
        const ovalMatch = simpleRemoveNoise(
          binarize(matchTemplateImage(imageData, ovalTemplate, loc(x, y))),
          255,
          2
        );
        const score = scoreTemplateMatch(ovalMatch, ovalMask);
        if (score < minimumScore) {
          minimumScore = score;
          minimumScoreRect = ovalRect;
          minimumScoredOffset = vec(xOffset, yOffset);
        }
      }
    }

    return {
      gridPosition,
      score: minimumScore,
      bounds: minimumScoreRect,
      scoredOffset: minimumScoredOffset,
    };
  });
}

/**
 * Convert a series of oval marks into a list of candidate votes.
 */
function convertMarksToVotes(
  contests: Contests,
  markThresholds: MarkThresholds,
  ovalMarks: readonly InterpretedOvalMark[]
): VotesDict {
  const votes: VotesDict = {};

  for (const mark of ovalMarks) {
    const { gridPosition } = mark;
    const { contestId } = gridPosition;
    const contest = find(contests, (c) => c.id === contestId);
    assert(
      contest.type === 'candidate',
      'only candidate contests are currently supported'
    );
    const candidate: Candidate =
      gridPosition.type === 'option'
        ? find(contest.candidates, (c) => c.id === gridPosition.optionId)
        : {
            id: `__write-in-${gridPosition.writeInIndex}`,
            name: `Write-In #${gridPosition.writeInIndex + 1}`,
            isWriteIn: true,
          };

    if (mark.score < markThresholds.marginal) {
      dbg(
        `Mark for contest '%s' option '%s' will be ignored, score is too low: %d < %d (marginal threshold)`,
        contestId,
        candidate.id,
        mark.score,
        markThresholds.marginal
      );
      continue;
    }

    if (mark.score < markThresholds.definite) {
      dbg(
        `Mark for contest '%s' option '%s' is marginal, score is too low: %d < %d (definite threshold)`,
        contestId,
        candidate.id,
        mark.score,
        markThresholds.definite
      );
      continue;
    }

    dbg(
      `Mark for contest '%s' option '%s' will be counted, score is high enough: %d (definite threshold) ≤ %d`,
      contestId,
      candidate.id,
      markThresholds.definite,
      mark.score
    );
    votes[contestId] = [
      ...((votes[contestId] ?? []) as CandidateVote),
      candidate,
    ];
  }

  return votes;
}

/**
 * Convert a series of oval marks into mark info.
 */
function convertMarksToMarkInfo(
  geometry: BallotCardGeometry,
  ovalMarks: readonly InterpretedOvalMark[]
): MarkInfo {
  return {
    ballotSize: geometry.canvasSize,
    marks: ovalMarks.map((mark) => {
      return {
        type: 'candidate',
        contestId: mark.gridPosition.contestId,
        optionId:
          mark.gridPosition.type === 'option'
            ? mark.gridPosition.optionId
            : `__write-in-${mark.gridPosition.writeInIndex}`,
        score: mark.score,
        bounds: mark.bounds,
        scoredOffset: mark.scoredOffset,
        // FIXME: Use real data here.
        target: {
          bounds: mark.bounds,
          inner: mark.bounds,
        },
      };
    }),
  };
}

/**
 * Interpret a ballot scan sheet.
 */
export async function interpret(
  electionDefinition: ElectionDefinition,
  sheet: [string, string]
): Promise<
  Result<[PageInterpretationWithFiles, PageInterpretationWithFiles], Error>
> {
  const paperSize = electionDefinition.election.ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

  const markThresholds = electionDefinition.election?.markThresholds ?? {
    definite: 0.05,
    marginal: 0.03,
  };

  const geometry = getScannedBallotCardGeometry(paperSize);
  let [frontPage, backPage] = sheet;
  let frontImageData = await readGrayscaleImage(frontPage);
  let backImageData = await readGrayscaleImage(backPage);
  let frontLayout = interpretPageLayout(frontImageData, { geometry });
  let backLayout = interpretPageLayout(backImageData, { geometry });

  if (!frontLayout) {
    return err(new Error('could not interpret front page layout'));
  }

  if (!backLayout) {
    return err(new Error('could not interpret back page layout'));
  }

  if (frontLayout.side === 'back') {
    [
      frontLayout,
      backLayout,
      frontImageData,
      backImageData,
      frontPage,
      backPage,
    ] = [
      backLayout,
      frontLayout,
      backImageData,
      frontImageData,
      backPage,
      frontPage,
    ];
  }

  if (frontLayout.side === 'back' || backLayout.side === 'front') {
    return err(
      new Error(
        `invalid ballot card: expected front and back pages but got ${frontLayout.side} and ${backLayout.side}`
      )
    );
  }

  const ballotStyleId = `card-number-${frontLayout.metadata.cardNumber}`;
  const gridLayout = electionDefinition.election.gridLayouts?.find(
    (layout) => layout.ballotStyleId === ballotStyleId
  );

  if (!gridLayout) {
    return err(
      new Error(
        `could not find grid layout for ballot style ID ${ballotStyleId}`
      )
    );
  }

  const scanOvalImage = await getBallotScanOvalImage();
  const interpretedOvalMarks = interpretOvalMarks(
    geometry,
    scanOvalImage,
    frontImageData,
    backImageData,
    frontLayout,
    backLayout,
    gridLayout
  );

  const frontMarks = interpretedOvalMarks.filter(
    (m) => m.gridPosition.side === 'front'
  );
  const backMarks = interpretedOvalMarks.filter(
    (m) => m.gridPosition.side === 'back'
  );
  const frontMetadata: HmpbBallotPageMetadata = {
    ballotStyleId,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: false,
    locales: { primary: 'unknown' },
    pageNumber: 1,
    precinctId: '',
  };
  const backMetadata: HmpbBallotPageMetadata = {
    ...frontMetadata,
    pageNumber: frontMetadata.pageNumber + 1,
  };
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    // TODO: make this real
    adjudicationInfo: {
      requiresAdjudication: false,
      enabledReasonInfos: [],
      enabledReasons: [],
      ignoredReasonInfos: [],
    },
    markInfo: convertMarksToMarkInfo(geometry, frontMarks),
    // FIXME: Much of this information is not available in the scanned ballot.
    // We may need a way to set some of this as state while scanning a batch.
    metadata: frontMetadata,
    votes: convertMarksToVotes(
      electionDefinition.election.contests,
      markThresholds,
      frontMarks
    ),
  };
  const backInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    // TODO: make this real
    adjudicationInfo: {
      requiresAdjudication: false,
      enabledReasonInfos: [],
      enabledReasons: [],
      ignoredReasonInfos: [],
    },
    markInfo: convertMarksToMarkInfo(geometry, backMarks),
    // FIXME: Much of this information is not available in the scanned ballot.
    // We may need a way to set some of this as state while scanning a batch.
    metadata: backMetadata,
    votes: convertMarksToVotes(
      electionDefinition.election.contests,
      markThresholds,
      backMarks
    ),
  };

  const frontPageInterpretationWithFiles: PageInterpretationWithFiles = {
    originalFilename: frontPage,
    normalizedFilename: frontPage,
    interpretation: frontInterpretation,
  };
  const backPageInterpretationWithFiles: PageInterpretationWithFiles = {
    originalFilename: backPage,
    normalizedFilename: backPage,
    interpretation: backInterpretation,
  };

  return ok([
    frontPageInterpretationWithFiles,
    backPageInterpretationWithFiles,
  ]);
}
