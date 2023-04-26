import {
  decodeBallot,
  decodeElectionHash,
  detectRawBytesBmdBallot,
  sliceElectionHash,
} from '@votingworks/ballot-encoder';
import { QrCodePageResult } from '@votingworks/ballot-interpreter-vx';
import {
  AdjudicationReason,
  BallotType,
  ElectionDefinition,
  InterpretedBmdPage,
  MarkThresholds,
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
import path from 'path';
import { BallotPageQrcode } from './types';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('interpreter');

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
  markThresholdOverrides?: MarkThresholds;
  adjudicationReasons: readonly AdjudicationReason[];
}

export class Interpreter {
  private readonly electionDefinition: ElectionDefinition;
  private readonly precinctSelection: PrecinctSelection;
  private readonly testMode: boolean;
  private readonly markThresholds: MarkThresholds;
  private readonly adjudicationReasons: readonly AdjudicationReason[];

  constructor({
    electionDefinition,
    testMode,
    markThresholdOverrides,
    precinctSelection,
    adjudicationReasons,
  }: InterpreterOptions) {
    this.electionDefinition = electionDefinition;
    this.testMode = testMode;
    this.precinctSelection = precinctSelection;

    const markThresholds =
      markThresholdOverrides ?? electionDefinition.election.markThresholds;

    if (!markThresholds) {
      throw new Error('missing mark thresholds');
    }

    this.markThresholds = markThresholds;
    this.adjudicationReasons = adjudicationReasons;
  }

  interpretFile({
    ballotImagePath,
    detectQrcodeResult,
  }: InterpretFileParams): InterpretFileResult {
    const timer = time(
      rootDebug,
      `interpretFile: ${path.basename(ballotImagePath)}`
    );

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

    timer.checkpoint('loadedImageData');

    if (
      !isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
      )
    ) {
      const actualElectionHash =
        decodeElectionHash(detectQrcodeResult.qrcode.data) ?? 'not found';
      const expectedElectionHash = sliceElectionHash(
        this.electionDefinition.electionHash
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

    timer.checkpoint('attemptedBmdImageInterpretation');

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

    return {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'unknown ballot type',
      },
    };
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
