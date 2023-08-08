import { interpret as interpretNhHmpbBallotSheet } from '@votingworks/ballot-interpreter-nh';
import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { Result, throwIllegalValue, typedAs } from '@votingworks/basics';
import { loadImageData } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotType,
  ElectionDefinition,
  InvalidElectionHashPage,
  InvalidPrecinctPage,
  InvalidTestModePage,
  mapSheet,
  MarkThresholds,
  PageInterpretation,
  PageInterpretationWithFiles,
  PrecinctSelection,
  SheetInterpretation,
  SheetOf,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION, time } from '@votingworks/utils';
import makeDebug from 'debug';
import { interpret as interpretVxBmdBallotSheet } from './bmd';
import { convertNhInterpretResultToLegacyResult } from './legacy_adapter';

const debug = makeDebug('ballot-interpreter:scan:interpreter');

/**
 * Result of interpreting a sheet of ballot images.
 */
export type InterpretResult = Result<SheetOf<InterpretFileResult>, Error>;

/**
 * Result of interpreting a single ballot image.
 */
export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage: ImageData;
}

/**
 * Options for interpreting a sheet of ballot images.
 */
export interface InterpreterOptions {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
  markThresholds?: MarkThresholds;
  adjudicationReasons?: readonly AdjudicationReason[];
}

/**
 * An interpretation for one ballot sheet that includes both the interpretation
 * result for the sheet as a whole and the individual page (i.e. front and back)
 * interpretations.
 */
export type SheetInterpretationWithPages = SheetInterpretation & {
  pages: SheetOf<PageInterpretationWithFiles>;
};

/**
 * Validates the interpreter results against the scanning configuration.
 *
 * @returns The same results, but with any invalid results replaced with an
 *          error result.
 */
function validateInterpretResults(
  results: SheetOf<InterpretFileResult>,
  {
    electionHash,
    precinctSelection,
    testMode,
  }: {
    electionHash: string;
    precinctSelection: PrecinctSelection;
    testMode: boolean;
  }
): SheetOf<InterpretFileResult> {
  return mapSheet(results, ({ interpretation, normalizedImage }) => {
    if (!('metadata' in interpretation)) {
      return { interpretation, normalizedImage };
    }

    const metadata = interpretation.metadata as BallotMetadata;

    if (metadata.isTestMode !== testMode) {
      return {
        interpretation: typedAs<InvalidTestModePage>({
          type: 'InvalidTestModePage',
          metadata,
        }),
        normalizedImage,
      };
    }

    if (
      precinctSelection.kind !== ALL_PRECINCTS_SELECTION.kind &&
      metadata.precinctId !== precinctSelection.precinctId
    ) {
      return {
        interpretation: typedAs<InvalidPrecinctPage>({
          type: 'InvalidPrecinctPage',
          metadata,
        }),
        normalizedImage,
      };
    }

    // metadata.electionHash may be a sliced hash or a full hash, so we need to
    // slice both hashes before comparing them.
    if (
      sliceElectionHash(metadata.electionHash) !==
      sliceElectionHash(electionHash)
    ) {
      return {
        interpretation: typedAs<InvalidElectionHashPage>({
          type: 'InvalidElectionHashPage',
          expectedElectionHash: sliceElectionHash(electionHash),
          actualElectionHash: sliceElectionHash(metadata.electionHash),
        }),
        normalizedImage,
      };
    }

    return { interpretation, normalizedImage };
  });
}

/**
 * Interpret a NH HMPB ballot sheet.
 */
function interpretAndConvertNhHmpbResult(
  electionDefinition: ElectionDefinition,
  sheet: SheetOf<string>,
  options: InterpreterOptions
): SheetOf<InterpretFileResult> {
  const result = interpretNhHmpbBallotSheet(electionDefinition, sheet, {
    scoreWriteIns:
      (electionDefinition.election.markThresholds?.writeInTextArea ??
        options.markThresholds?.writeInTextArea) !== undefined,
  });

  return validateInterpretResults(
    convertNhInterpretResultToLegacyResult(options, result).unsafeUnwrap(),
    {
      electionHash: electionDefinition.electionHash,
      precinctSelection: options.precinctSelection,
      testMode: options.testMode,
    }
  );
}

/**
 * Interpret a sheet of ballot images.
 */
export async function interpretSheet(
  {
    electionDefinition,
    precinctSelection,
    testMode,
    adjudicationReasons,
    markThresholds,
  }: InterpreterOptions,
  sheet: SheetOf<string>
): Promise<SheetOf<InterpretFileResult>> {
  const timer = time(debug, `interpretSheet: ${sheet.join(', ')}`);

  try {
    if (electionDefinition.election.gridLayouts) {
      return interpretAndConvertNhHmpbResult(electionDefinition, sheet, {
        electionDefinition,
        precinctSelection,
        testMode,
        adjudicationReasons,
        markThresholds,
      });
    }

    const ballotImages = await mapSheet(sheet, (ballotImagePath) =>
      loadImageData(ballotImagePath)
    );
    const interpretResult = await interpretVxBmdBallotSheet(
      electionDefinition,
      ballotImages
    );

    if (interpretResult.isErr()) {
      const error = interpretResult.err();
      if (error.type === 'mismatched-election') {
        return [
          {
            interpretation: {
              type: 'InvalidElectionHashPage',
              expectedElectionHash: error.expectedElectionHash,
              actualElectionHash: error.actualElectionHash,
            },
            normalizedImage: ballotImages[0],
          },
          {
            interpretation: {
              type: 'InvalidElectionHashPage',
              expectedElectionHash: error.expectedElectionHash,
              actualElectionHash: error.actualElectionHash,
            },
            normalizedImage: ballotImages[1],
          },
        ];
      }

      const [frontReason, backReason] = error.source;
      switch (error.type) {
        case 'votes-not-found':
          return [
            {
              interpretation: {
                type: 'BlankPage',
              },
              normalizedImage: ballotImages[0],
            },
            {
              interpretation: {
                type: 'BlankPage',
              },
              normalizedImage: ballotImages[1],
            },
          ];

        case 'multiple-qr-codes':
          return [
            {
              interpretation: {
                type: 'UnreadablePage',
                reason: JSON.stringify(frontReason),
              },
              normalizedImage: ballotImages[0],
            },
            {
              interpretation: {
                type: 'UnreadablePage',
                reason: JSON.stringify(backReason),
              },
              normalizedImage: ballotImages[1],
            },
          ];

        /* istanbul ignore next - compile-time check */
        default:
          throwIllegalValue(error, 'type');
      }
    }

    const { ballot, summaryBallotImage, blankPageImage } = interpretResult.ok();

    const front: InterpretFileResult = {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: ballot.ballotId,
        metadata: {
          electionHash: ballot.electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: ballot.ballotStyleId,
          precinctId: ballot.precinctId,
          isTestMode: ballot.isTestMode,
        },
        votes: ballot.votes,
      },
      normalizedImage: summaryBallotImage,
    };
    const back: InterpretFileResult = {
      interpretation: {
        type: 'BlankPage',
      },
      normalizedImage: blankPageImage,
    };

    return validateInterpretResults([front, back], {
      electionHash: electionDefinition.electionHash,
      precinctSelection,
      testMode,
    });
  } finally {
    timer.end();
  }
}
