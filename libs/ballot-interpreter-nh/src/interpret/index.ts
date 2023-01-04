import makeDebug from 'debug';

import {
  AdjudicationReason,
  BallotPageLayout,
  BallotType,
  ElectionDefinition,
  err,
  getBallotStyle,
  getContestsFromIds,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  MarkThresholds,
  ok,
  PageInterpretation,
  Result,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { getScannedBallotCardGeometry } from '../accuvote';
import { FrontMarksMetadata, InterpretedOvalMark } from '../types';
import { makeRect, vec } from '../utils';
import { convertMarksToAdjudicationInfo } from './convert_marks_to_adjudication_info';
import { convertMarksToMarkInfo } from './convert_marks_to_mark_info';
import { convertMarksToVotes } from './convert_marks_to_votes';
import * as rustImpl from './rust_impl';

const debugLogger = makeDebug('ballot-interpreter-nh:interpret');

/**
 * Default thresholds for interpreting marks on a ballot as votes.
 */
export const DefaultMarkThresholds: MarkThresholds = {
  definite: 0.08,
  marginal: 0.05,
};

/**
 * Result of interpretation of a ballot image, optionally with a normalized
 * image.
 */
export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage?: ImageData;
}

/**
 * Interpret a ballot scan sheet.
 */
export async function interpret(
  electionDefinition: ElectionDefinition,
  sheet: SheetOf<string>,
  {
    isTestMode,
    markThresholds = electionDefinition.election.markThresholds ??
      DefaultMarkThresholds,
    adjudicationReasons = [],
  }: {
    isTestMode: boolean;
    markThresholds?: MarkThresholds;
    adjudicationReasons?: readonly AdjudicationReason[];
  }
): Promise<Result<SheetOf<InterpretFileResult>, Error>> {
  const rustImplResult = await rustImpl.interpret(electionDefinition, sheet);

  const timer = time(debugLogger, 'interpret');

  const paperSize = electionDefinition.election.ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

  const geometry = getScannedBallotCardGeometry(paperSize);

  if (rustImplResult.isErr()) {
    return rustImplResult;
  }

  const rustInterpretation = rustImplResult.ok();

  function ovalMarksFromRustMarks(
    marks: rustImpl.InterpretedBallotPage['marks']
  ): InterpretedOvalMark[] {
    return marks.flatMap(([gridPosition, scoredOvalMark]) => {
      if (!scoredOvalMark) {
        return [];
      }

      return [
        {
          bounds: makeRect({
            minX: scoredOvalMark.expectedBounds.left,
            minY: scoredOvalMark.expectedBounds.top,
            maxX:
              scoredOvalMark.expectedBounds.left +
              scoredOvalMark.expectedBounds.width -
              1,
            maxY:
              scoredOvalMark.expectedBounds.top +
              scoredOvalMark.expectedBounds.height -
              1,
          }),
          gridPosition,
          score: scoredOvalMark.fillScore,
          scoredOffset: vec(
            scoredOvalMark.matchedBounds.left -
              scoredOvalMark.expectedBounds.left,
            scoredOvalMark.matchedBounds.top - scoredOvalMark.expectedBounds.top
          ),
        },
      ];
    });
  }

  const ballotStyleId = `card-number-${
    (rustInterpretation.front.grid.metadata as FrontMarksMetadata).cardNumber
  }`;
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });

  if (!ballotStyle) {
    return err(new Error(`no ballot style found for ${ballotStyleId}`));
  }

  const precinctId = ballotStyle.precincts[0];

  if (!precinctId) {
    return err(new Error('no precinct found for ballot style'));
  }

  const frontMarks = ovalMarksFromRustMarks(rustInterpretation.front.marks);
  const frontMetadata: HmpbBallotPageMetadata = {
    ballotStyleId,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode,
    locales: { primary: 'unknown' },
    pageNumber: 1,
    precinctId,
  };
  const backMetadata: HmpbBallotPageMetadata = {
    ...frontMetadata,
    pageNumber: frontMetadata.pageNumber + 1,
  };
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: convertMarksToAdjudicationInfo({
      contests: getContestsFromIds(
        electionDefinition.election,
        rustInterpretation.front.marks.map((mark) => mark[0].contestId)
      ),
      enabledReasons: adjudicationReasons,
      markThresholds,
      ovalMarks: frontMarks,
    }),
    markInfo: convertMarksToMarkInfo(geometry, frontMarks),
    // FIXME: Much of this information is not available in the scanned ballot.
    // We may need a way to set some of this as state while scanning a batch.
    metadata: frontMetadata,
    votes: convertMarksToVotes(
      electionDefinition.election.contests,
      markThresholds,
      frontMarks
    ),
    layout: undefined as unknown as BallotPageLayout,
  };
  const backMarks = ovalMarksFromRustMarks(rustInterpretation.back.marks);
  const backInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: convertMarksToAdjudicationInfo({
      contests: getContestsFromIds(
        electionDefinition.election,
        rustInterpretation.back.marks.map((mark) => mark[0].contestId)
      ),
      enabledReasons: adjudicationReasons,
      markThresholds,
      ovalMarks: backMarks,
    }),
    markInfo: convertMarksToMarkInfo(geometry, backMarks),
    // FIXME: Much of this information is not available in the scanned ballot.
    // We may need a way to set some of this as state while scanning a batch.
    metadata: backMetadata,
    votes: convertMarksToVotes(
      electionDefinition.election.contests,
      markThresholds,
      backMarks
    ),
    layout: undefined as unknown as BallotPageLayout,
  };

  const frontPageInterpretationResult: InterpretFileResult = {
    interpretation: frontInterpretation,
  };
  const backPageInterpretationResult: InterpretFileResult = {
    interpretation: backInterpretation,
  };

  timer.end();

  return ok([frontPageInterpretationResult, backPageInterpretationResult]);
}
