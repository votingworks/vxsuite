import {
  decodeBallot,
  decodeElectionHash,
  detectRawBytesBmdBallot,
  ELECTION_HASH_LENGTH,
} from '@votingworks/ballot-encoder';
import { QrCodePageResult } from '@votingworks/ballot-interpreter-vx';
import { throwIllegalValue } from '@votingworks/basics';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotType,
  ElectionDefinition,
  PageInterpretation,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  time,
} from '@votingworks/utils';
import { ImageData } from 'canvas';
import makeDebug from 'debug';

const debug = makeDebug('scan:interpreter');

export interface InterpretFileParams {
  readonly ballotImagePath: string;
  readonly detectQrcodeResult: QrCodePageResult;
}

export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage?: ImageData;
}

/**
 * Determine if a sheet needs adjudication.
 */
export function sheetRequiresAdjudication([
  front,
  back,
]: SheetOf<PageInterpretation>): boolean {
  if (
    front.type === 'InterpretedBmdPage' ||
    back.type === 'InterpretedBmdPage'
  ) {
    return false;
  }

  const [frontRequiresAdjudicationNonBlank, backRequiresAdjudicationNonBlank] =
    [front, back].map(
      (pi) =>
        pi.type === 'UnreadablePage' ||
        pi.type === 'InvalidTestModePage' ||
        pi.type === 'InvalidElectionHashPage' ||
        pi.type === 'InvalidPrecinctPage' ||
        (pi.type === 'InterpretedHmpbPage' &&
          pi.adjudicationInfo.requiresAdjudication &&
          !pi.adjudicationInfo.enabledReasonInfos.some(
            (reasonInfo) => reasonInfo.type === AdjudicationReason.BlankBallot
          ))
    );

  // non-blank adjudication reasons are "dominant" traits: one page triggers adjudication
  if (frontRequiresAdjudicationNonBlank || backRequiresAdjudicationNonBlank) {
    return true;
  }

  // Always require adjudication of pairs with HMPB & something else.
  if (
    (front.type === 'InterpretedHmpbPage' &&
      back.type !== 'InterpretedHmpbPage') ||
    (back.type === 'InterpretedHmpbPage' &&
      front.type !== 'InterpretedHmpbPage')
  ) {
    return true;
  }

  const [frontIsBlankHmpbPage, backIsBlankHmpbPage] = [front, back].map(
    (pi) =>
      pi.type === 'BlankPage' || // truly blank page matters whether or not it's an adjudication reason.
      (pi.type === 'InterpretedHmpbPage' &&
        (pi.markInfo.marks.length === 0 || // no potential marks == automatic blank
          (pi.adjudicationInfo.requiresAdjudication &&
            pi.adjudicationInfo.enabledReasonInfos.some(
              (reasonInfo) => reasonInfo.type === AdjudicationReason.BlankBallot
            ))))
  );

  // blank-page adjudication is a "recessive" trait: both pages need to be blank to trigger
  if (frontIsBlankHmpbPage && backIsBlankHmpbPage) {
    return true;
  }

  return false;
}

export interface InterpreterOptions {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
}

export function interpretFile(
  { electionDefinition, precinctSelection, testMode }: InterpreterOptions,
  { ballotImagePath, detectQrcodeResult }: InterpretFileParams
): InterpretFileResult {
  const timer = time(debug, `interpretFile: ${ballotImagePath}`);

  try {
    if (detectQrcodeResult.isErr()) {
      const error = detectQrcodeResult.err();
      switch (error.type) {
        case 'blank-page':
          return { interpretation: { type: 'BlankPage' } };

        case 'no-qr-code':
          return {
            interpretation: {
              type: 'UnreadablePage',
              reason: 'No QR code found',
            },
          };

        default:
          throwIllegalValue(error);
      }
    }

    const qrcode = detectQrcodeResult.ok();

    if (
      !isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
      )
    ) {
      const actualElectionHash = decodeElectionHash(qrcode.data) ?? 'not found';
      const expectedElectionHash = electionDefinition.electionHash.slice(
        0,
        ELECTION_HASH_LENGTH
      );

      debug(
        'comparing election hash (%s) to expected value (%s)',
        actualElectionHash,
        expectedElectionHash
      );
      if (actualElectionHash !== expectedElectionHash) {
        return {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash,
            actualElectionHash,
          },
        };
      }
    }

    if (!detectRawBytesBmdBallot(qrcode.data)) {
      return {
        interpretation: {
          type: 'UnreadablePage',
        },
      };
    }

    debug('decoding BMD ballot: %o', qrcode);
    const ballot = decodeBallot(electionDefinition.election, qrcode.data);
    debug('decoded BMD ballot: %o', ballot.votes);

    const metadata: BallotMetadata = {
      electionHash: ballot.electionHash,
      ballotType: BallotType.Standard,
      locales: { primary: 'en-US' },
      ballotStyleId: ballot.ballotStyleId,
      precinctId: ballot.precinctId,
      isTestMode: ballot.isTestMode,
    };

    if (ballot.isTestMode !== testMode) {
      return {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata,
        },
      };
    }

    if (
      precinctSelection.kind !== 'AllPrecincts' &&
      metadata.precinctId !== precinctSelection.precinctId
    ) {
      return {
        interpretation: {
          type: 'InvalidPrecinctPage',
          metadata,
        },
      };
    }

    return {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: ballot.ballotId,
        metadata,
        votes: ballot.votes,
      },
    };
  } finally {
    timer.end();
  }
}
