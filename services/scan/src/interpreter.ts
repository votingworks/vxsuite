//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  decodeBallot,
  decodeElectionHash,
  detect,
  ELECTION_HASH_LENGTH,
} from '@votingworks/ballot-encoder';
import {
  Interpreter as HmpbInterpreter,
  metadataFromBytes,
} from '@votingworks/ballot-interpreter-vx';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  BallotType,
  ElectionDefinition,
  err,
  getContestsFromIds,
  InterpretedBmdPage,
  MarkThresholds,
  ok,
  PageInterpretation,
  Result,
} from '@votingworks/types';
import {
  adjudicationReasonDescription,
  assert,
  ballotAdjudicationReasons,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { BallotPageQrcode, SheetOf } from './types';
import { loadImageData } from './util/images';
import { optionMarkStatus } from './util/option_mark_status';
import { time } from './util/perf';
import * as qrcodeWorker from './workers/qrcode';

const debug = makeDebug('scan:interpreter');

export interface InterpretFileParams {
  readonly ballotImagePath: string;
  readonly ballotImageFile: Buffer;
  readonly detectQrcodeResult: qrcodeWorker.Output;
}

export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage?: ImageData;
}

interface BallotImageData {
  file: Buffer;
  image: ImageData;
  qrcode: BallotPageQrcode;
}

export async function getBallotImageData(
  file: Buffer,
  filename: string,
  detectQrcodeResult: qrcodeWorker.Output
): Promise<Result<BallotImageData, PageInterpretation>> {
  const { data, width, height } = await loadImageData(file);
  const image: ImageData = {
    data: Uint8ClampedArray.from(data),
    width,
    height,
  };

  if (!detectQrcodeResult.blank && detectQrcodeResult.qrcode) {
    return ok({ file, image, qrcode: detectQrcodeResult.qrcode });
  }

  debug('no QR code found in %s', filename);
  return err({
    type: 'UnreadablePage',
    reason: 'No QR code found',
  });
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
        pi.type === 'UninterpretedHmpbPage' ||
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
  testMode: boolean;
  markThresholdOverrides?: MarkThresholds;
  skipElectionHashCheck?: boolean;
  adjudicationReasons: readonly AdjudicationReason[];
}

export class Interpreter {
  private hmpbInterpreter?: HmpbInterpreter;
  private electionDefinition: ElectionDefinition;
  private testMode: boolean;
  private markThresholds: MarkThresholds;
  private skipElectionHashCheck?: boolean;
  private adjudicationReasons: readonly AdjudicationReason[];

  constructor({
    electionDefinition,
    testMode,
    markThresholdOverrides,
    skipElectionHashCheck,
    adjudicationReasons,
  }: InterpreterOptions) {
    this.electionDefinition = electionDefinition;
    this.testMode = testMode;

    const markThresholds =
      markThresholdOverrides ?? electionDefinition.election.markThresholds;

    if (!markThresholds) {
      throw new Error('missing mark thresholds');
    }

    this.markThresholds = markThresholds;
    this.skipElectionHashCheck = skipElectionHashCheck;
    this.adjudicationReasons = adjudicationReasons;
  }

  addHmpbTemplate(
    layout: BallotPageLayoutWithImage
  ): BallotPageLayoutWithImage {
    const interpreter = this.getHmpbInterpreter();
    const { metadata } = layout.ballotPageLayout;

    debug(
      'Adding HMPB template page %d: ballotStyleId=%s precinctId=%s isTestMode=%s',
      metadata.pageNumber,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestMode
    );

    if (metadata.isTestMode === this.testMode) {
      debug(
        'template test mode (%s) matches current test mode (%s), adding to underlying interpreter',
        metadata.isTestMode,
        this.testMode
      );
      interpreter.addTemplate(layout);
    } else {
      debug(
        'template test mode (%s) does not match current test mode (%s), skipping',
        metadata.isTestMode,
        this.testMode
      );
    }

    return layout;
  }

  async interpretHmpbTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayoutWithImage> {
    const interpreter = this.getHmpbInterpreter();
    return await interpreter.interpretTemplate(imageData, metadata);
  }

  async interpretFile({
    ballotImagePath,
    ballotImageFile,
    detectQrcodeResult,
  }: InterpretFileParams): Promise<InterpretFileResult> {
    const timer = time(`interpretFile: ${ballotImagePath}`);
    const result = await getBallotImageData(
      ballotImageFile,
      ballotImagePath,
      detectQrcodeResult
    );

    if (result.isErr()) {
      timer.end();
      return { interpretation: result.err() };
    }

    const ballotImageData = result.ok();
    if (!this.skipElectionHashCheck) {
      const actualElectionHash =
        decodeElectionHash(ballotImageData.qrcode.data) ?? 'not found';
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

    const bmdResult = this.interpretBMDFile(ballotImageData);

    if (bmdResult) {
      const bmdMetadata = (bmdResult.interpretation as InterpretedBmdPage)
        .metadata;
      if (bmdMetadata.isTestMode === this.testMode) {
        timer.end();
        return bmdResult;
      }

      timer.end();
      return {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: bmdMetadata,
        },
      };
    }

    try {
      const hmpbResult = await this.interpretHMPBFile(ballotImageData);

      if (hmpbResult) {
        timer.end();
        return hmpbResult;
      }
    } catch (error) {
      assert(error instanceof Error);
      debug('interpretHMPBFile failed: %s', error.message);
    }

    try {
      debug(
        'assuming ballot is a HMPB that could not be interpreted (QR data: %s)',
        new TextDecoder().decode(ballotImageData.qrcode.data)
      );
      const metadata = metadataFromBytes(
        this.electionDefinition,
        Buffer.from(ballotImageData.qrcode.data)
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
          type: 'UninterpretedHmpbPage',
          metadata,
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

  private interpretBMDFile({
    qrcode,
  }: BallotImageData): InterpretFileResult | undefined {
    if (!detect(qrcode.data)) {
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

  private async interpretHMPBFile({
    image,
    qrcode,
  }: BallotImageData): Promise<InterpretFileResult | undefined> {
    const hmpbInterpreter = this.getHmpbInterpreter();
    const { ballot, marks, mappedBallot, metadata } =
      await hmpbInterpreter.interpretBallot(
        image,
        metadataFromBytes(this.electionDefinition, Buffer.from(qrcode.data)),
        { flipped: qrcode.position === 'top' }
      );
    const { votes } = ballot;

    const enabledReasons = this.adjudicationReasons;

    const allReasonInfos: readonly AdjudicationReasonInfo[] = Array.from(
      ballotAdjudicationReasons(
        getContestsFromIds(
          this.electionDefinition.election,
          marks.map((m) => m.contestId)
        ),
        {
          optionMarkStatus: (option) =>
            optionMarkStatus({
              contests: this.electionDefinition.election.contests,
              markThresholds: this.markThresholds,
              marks,
              contestId: option.contestId,
              optionId: option.id,
            }),
        }
      )
    );

    const enabledReasonInfos: AdjudicationReasonInfo[] = [];
    const ignoredReasonInfos: AdjudicationReasonInfo[] = [];

    for (const reason of allReasonInfos) {
      if (enabledReasons.includes(reason.type)) {
        debug(
          'Adjudication required for reason: %s',
          adjudicationReasonDescription(reason)
        );
        enabledReasonInfos.push(reason);
      } else {
        debug(
          'Adjudication reason ignored by configuration: %s',
          adjudicationReasonDescription(reason)
        );
        ignoredReasonInfos.push(reason);
      }
    }

    const requiresAdjudication = enabledReasonInfos.length > 0;

    return {
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata,
        markInfo: {
          marks,
          ballotSize: {
            width: mappedBallot.width,
            height: mappedBallot.height,
          },
        },
        votes,
        adjudicationInfo: {
          requiresAdjudication,
          enabledReasons,
          enabledReasonInfos,
          ignoredReasonInfos,
        },
      },
      normalizedImage: mappedBallot,
    };
  }

  private getHmpbInterpreter(): HmpbInterpreter {
    if (!this.hmpbInterpreter) {
      if (typeof this.testMode === 'undefined') {
        throw new Error(
          'testMode has not been configured; please set it to true or false before interpreting ballots'
        );
      }

      this.hmpbInterpreter = new HmpbInterpreter({
        electionDefinition: this.electionDefinition,
        testMode: this.testMode,
      });
    }
    return this.hmpbInterpreter;
  }
}
