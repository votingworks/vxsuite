import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  ElectionDefinition,
  Id,
  MarkThresholds,
  PageInterpretationWithFiles,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { err, ok, Optional, Result } from '@votingworks/basics';
import { interpretSheetAndSaveImages } from '@votingworks/ballot-interpreter';
import { rootDebug } from './util/debug';
import { SheetInterpretation } from './types';

export interface InterpreterConfig {
  readonly electionDefinition: ElectionDefinition;
  readonly precinctSelection: PrecinctSelection;
  readonly ballotImagesPath: string;
  readonly markThresholdOverrides?: MarkThresholds;
  readonly testMode: boolean;
}

/**
 * A configurable interpreter for the precinct scanner.
 */
export interface PrecinctScannerInterpreter {
  configure(options: InterpreterConfig): void;
  unconfigure(): void;
  isConfigured(): boolean;
  interpret(
    sheetId: Id,
    sheet: SheetOf<string>
  ): Promise<Result<SheetInterpretationWithPages, Error>>;
}

/**
 * An interpretation for one ballot sheet that includes both the interpretation
 * result for the sheet as a whole and the individual page (i.e. front and back)
 * interpretations.
 */
export type SheetInterpretationWithPages = SheetInterpretation & {
  pages: SheetOf<PageInterpretationWithFiles>;
};

function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InterpretedHmpbPage' &&
    backType === 'InterpretedHmpbPage'
  ) {
    const frontAdjudication = front.interpretation.adjudicationInfo;
    const backAdjudication = back.interpretation.adjudicationInfo;

    if (
      !(
        frontAdjudication.requiresAdjudication ||
        backAdjudication.requiresAdjudication
      )
    ) {
      return { type: 'ValidSheet' };
    }

    const frontReasons = frontAdjudication.enabledReasonInfos;
    const backReasons = backAdjudication.enabledReasonInfos;

    let reasons: AdjudicationReasonInfo[];
    // If both sides are blank, the ballot is blank
    if (
      (frontReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      ) ||
        front.interpretation.markInfo.marks.length === 0) &&
      (backReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      ) ||
        back.interpretation.markInfo.marks.length === 0)
    ) {
      reasons = [{ type: AdjudicationReason.BlankBallot }];
    }
    // Otherwise, we can ignore blank sides
    else {
      reasons = [...frontReasons, ...backReasons].filter(
        (reason) => reason.type !== AdjudicationReason.BlankBallot
      );
    }

    // If there are any non-blank reasons, they should be reviewed
    if (reasons.length > 0) {
      return {
        type: 'NeedsReviewSheet',
        reasons,
      };
    }
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InvalidElectionHashPage' ||
    backType === 'InvalidElectionHashPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_election_hash',
    };
  }

  if (
    frontType === 'InvalidTestModePage' ||
    backType === 'InvalidTestModePage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_test_mode',
    };
  }

  if (
    frontType === 'InvalidPrecinctPage' ||
    backType === 'InvalidPrecinctPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };
  }

  if (frontType === 'UnreadablePage' || backType === 'UnreadablePage') {
    return {
      type: 'InvalidSheet',
      reason: 'unreadable',
    };
  }

  return {
    type: 'InvalidSheet',
    reason: 'unknown',
  };
}

/**
 * Create an interpreter for the precinct scanner. The interpreter can be
 * configured and unconfigured with different election settings.
 */
export function createInterpreter(): PrecinctScannerInterpreter {
  let config: Optional<InterpreterConfig>;

  return {
    configure(newConfig: InterpreterConfig) {
      config = newConfig;
    },

    unconfigure() {
      config = undefined;
    },

    isConfigured() {
      return config !== undefined;
    },

    interpret: async (sheetId, sheet) => {
      if (!config) return err(Error('Interpreter not configured'));

      const {
        electionDefinition,
        ballotImagesPath,
        precinctSelection,
        testMode,
      } = config;
      const timer = time(rootDebug, `vxInterpret: ${sheetId}`);

      const pageInterpretations = await interpretSheetAndSaveImages(
        {
          electionDefinition,
          precinctSelection,
          testMode,
          adjudicationReasons:
            electionDefinition.election.precinctScanAdjudicationReasons,
          markThresholds: config.markThresholdOverrides,
        },
        sheet,
        sheetId,
        ballotImagesPath
      );

      timer.end();

      return ok({
        ...combinePageInterpretationsForSheet(pageInterpretations),
        pages: pageInterpretations,
      });
    },
  };
}
