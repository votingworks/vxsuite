import {
  BallotType,
  ElectionDefinition,
  err,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  MarkThresholds,
  ok,
  PageInterpretationWithFiles,
  Result,
} from '@votingworks/types';
import { getScannedBallotCardGeometry } from '../accuvote';
import * as templates from '../data/templates';
import { readGrayscaleImage } from '../images';
import { convertMarksToMarkInfo } from './convert_marks_to_mark_info';
import { convertMarksToVotes } from './convert_marks_to_votes';
import { interpretOvalMarks } from './interpret_oval_marks';
import { interpretPageLayout } from './interpret_page_layout';

/**
 * Default thresholds for interpreting marks on a ballot as votes.
 */
export const DefaultMarkThresholds: MarkThresholds = {
  definite: 0.05,
  marginal: 0.03,
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
  }: { markThresholds?: MarkThresholds } = {}
): Promise<
  Result<[PageInterpretationWithFiles, PageInterpretationWithFiles], Error>
> {
  const paperSize = electionDefinition.election.ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

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
