import {
  AdjudicationReason,
  BallotType,
  ElectionDefinition,
  err,
  getBallotStyle,
  getContests,
  getContestsFromIds,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  MarkThresholds,
  ok,
  PageInterpretationWithFiles,
  Result,
} from '@votingworks/types';
import { getScannedBallotCardGeometry } from '../accuvote';
import * as templates from '../data/templates';
import { imageDebugger } from '../debug';
import * as images from '../images';
import { convertInterpretedLayoutToBallotLayout } from './convert_interpreted_layout_to_ballot_layout';
import { convertMarksToAdjudicationInfo } from './convert_marks_to_adjudication_info';
import { convertMarksToMarkInfo } from './convert_marks_to_mark_info';
import { convertMarksToVotes } from './convert_marks_to_votes';
import { interpretBallotCardLayout } from './interpret_ballot_card_layout';
import { interpretOvalMarks } from './interpret_oval_marks';

/**
 * Default thresholds for interpreting marks on a ballot as votes.
 */
export const DefaultMarkThresholds: MarkThresholds = {
  definite: 0.12,
  marginal: 0.1,
};

/**
 * Interpret a ballot scan sheet.
 */
export async function interpret(
  electionDefinition: ElectionDefinition,
  sheet: [string, string],
  {
    markThresholds = electionDefinition.election.markThresholds ??
      DefaultMarkThresholds,
    adjudicationReasons = [],
  }: {
    markThresholds?: MarkThresholds;
    adjudicationReasons?: readonly AdjudicationReason[];
  } = {}
): Promise<
  Result<[PageInterpretationWithFiles, PageInterpretationWithFiles], Error>
> {
  const paperSize = electionDefinition.election.ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

  const geometry = getScannedBallotCardGeometry(paperSize);
  let [frontPage, backPage] = sheet;
  let frontImageData = images.toImageData(await images.load(frontPage), {
    maxWidth: geometry.canvasSize.width,
    maxHeight: geometry.canvasSize.height,
  });
  let backImageData = images.toImageData(await images.load(backPage), {
    maxWidth: geometry.canvasSize.width,
    maxHeight: geometry.canvasSize.height,
  });

  const frontDebug = imageDebugger(frontPage, frontImageData);
  const backDebug = imageDebugger(backPage, backImageData);
  let frontLayout = frontDebug.capture('front-interpret', (debug) =>
    interpretBallotCardLayout(frontImageData, { geometry, debug })
  );
  let backLayout = backDebug.capture('back-interpret', (debug) =>
    interpretBallotCardLayout(backImageData, { geometry, debug })
  );

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
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });

  if (!ballotStyle) {
    return err(new Error(`no ballot style found for ${ballotStyleId}`));
  }

  const contests = getContests({
    election: electionDefinition.election,
    ballotStyle,
  });
  const precinctId = ballotStyle.precincts[0];

  if (!precinctId) {
    return err(new Error('no precinct found for ballot style'));
  }

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

  const ovalTemplate = await templates.getOvalScanTemplate();
  const interpretedOvalMarks = interpretOvalMarks({
    geometry,
    ovalTemplate,
    frontImageData,
    backImageData,
    frontLayout,
    backLayout,
    gridLayout,
  });

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
    precinctId,
  };
  const backMetadata: HmpbBallotPageMetadata = {
    ...frontMetadata,
    pageNumber: frontMetadata.pageNumber + 1,
  };
  const frontConvertedLayout = frontDebug.capture('front-layout', () =>
    convertInterpretedLayoutToBallotLayout({
      gridLayout,
      contests,
      metadata: frontMetadata,
      interpretedLayout: frontLayout,
      debug: frontDebug,
    })
  );
  const backConvertedLayout = backDebug.capture('back-layout', () =>
    convertInterpretedLayoutToBallotLayout({
      gridLayout,
      contests,
      metadata: backMetadata,
      interpretedLayout: backLayout,
      debug: backDebug,
    })
  );

  if (frontConvertedLayout.isErr()) {
    return frontConvertedLayout;
  }

  if (backConvertedLayout.isErr()) {
    return backConvertedLayout;
  }

  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: convertMarksToAdjudicationInfo({
      contests: getContestsFromIds(
        electionDefinition.election,
        frontMarks.map(({ gridPosition: { contestId } }) => contestId)
      ),
      enabledReasons: adjudicationReasons,
      markThresholds,
      ovalMarks: interpretedOvalMarks,
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
    layout: frontConvertedLayout.ok(),
  };
  const backInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: convertMarksToAdjudicationInfo({
      contests: getContestsFromIds(
        electionDefinition.election,
        backMarks.map(({ gridPosition: { contestId } }) => contestId)
      ),
      enabledReasons: adjudicationReasons,
      markThresholds,
      ovalMarks: interpretedOvalMarks,
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
    layout: backConvertedLayout.ok(),
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
