//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  decodeBallot,
  decodeElectionHash,
  detectRawBytesBmdBallot,
  ELECTION_HASH_LENGTH,
} from '@votingworks/ballot-encoder';
import {
  metadataFromBytes,
  QrCodePageResult,
} from '@votingworks/ballot-interpreter-vx';
import { assert } from '@votingworks/basics';
import {
  AdjudicationReason,
  BallotType,
  ElectionDefinition,
  InterpretedBmdPage,
  PageInterpretation,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  time,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
import makeDebug from 'debug';
import { BallotPageQrcode } from './types';

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
  adjudicationReasons: readonly AdjudicationReason[];
}

export class Interpreter {
  private readonly electionDefinition: ElectionDefinition;
  private readonly precinctSelection: PrecinctSelection;
  private readonly testMode: boolean;

  constructor({
    electionDefinition,
    testMode,
    precinctSelection,
  }: InterpreterOptions) {
    this.electionDefinition = electionDefinition;
    this.testMode = testMode;
    this.precinctSelection = precinctSelection;
  }

  interpretFile({
    ballotImagePath,
    detectQrcodeResult,
  }: InterpretFileParams): InterpretFileResult {
    const timer = time(debug, `interpretFile: ${ballotImagePath}`);

    if (detectQrcodeResult.blank) {
      return { interpretation: { type: 'BlankPage' } };
    }

    if (!detectQrcodeResult.qrcode) {
      return {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'No QR code found',
        },
      };
    }

    if (
      !isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
      )
    ) {
      const actualElectionHash =
        decodeElectionHash(detectQrcodeResult.qrcode.data) ?? 'not found';
      const expectedElectionHash = this.electionDefinition.electionHash.slice(
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

    const bmdResult = this.interpretBMDFile(detectQrcodeResult.qrcode);

    if (bmdResult) {
      const bmdMetadata = (bmdResult.interpretation as InterpretedBmdPage)
        .metadata;
      if (bmdMetadata.isTestMode !== this.testMode) {
        timer.end();
        return {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: bmdMetadata,
          },
        };
      }

      if (
        this.precinctSelection.kind !== 'AllPrecincts' &&
        bmdMetadata.precinctId !== this.precinctSelection.precinctId
      ) {
        timer.end();
        return {
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: bmdMetadata,
          },
        };
      }

      timer.end();
      return bmdResult;
    }

    try {
      debug(
        'assuming ballot is a HMPB that could not be interpreted (QR data: %s)',
        new TextDecoder().decode(detectQrcodeResult.qrcode.data)
      );
      const metadata = metadataFromBytes(
        this.electionDefinition,
        Buffer.from(detectQrcodeResult.qrcode.data)
      );

      if (metadata.isTestMode !== this.testMode) {
        debug(
          'cannot process a HMPB with isTestMode=%s when testMode=%s',
          metadata.isTestMode,
          this.testMode
        );
        timer.end();
        return {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata,
          },
        };
      }

      timer.end();
      return {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'Could not interpret HMPB',
        },
      };
    } catch (error) {
      assert(error instanceof Error);
      timer.end();
      return {
        interpretation: {
          type: 'UnreadablePage',
          reason: error.message,
        },
      };
    }
  }

  private interpretBMDFile(
    qrcode: BallotPageQrcode
  ): InterpretFileResult | undefined {
    if (!detectRawBytesBmdBallot(qrcode.data)) {
      return;
    }

    debug('decoding BMD ballot: %o', qrcode);
    const ballot = decodeBallot(this.electionDefinition.election, qrcode.data);
    debug('decoded BMD ballot: %o', ballot.votes);

    return {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: ballot.ballotId,
        metadata: {
          electionHash: ballot.electionHash,
          ballotType: BallotType.Standard,
          locales: { primary: 'en-US' },
          ballotStyleId: ballot.ballotStyleId,
          precinctId: ballot.precinctId,
          isTestMode: ballot.isTestMode,
        },
        votes: ballot.votes,
      },
    };
  }
}
