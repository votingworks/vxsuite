import {
  decodeBallot,
  decodeElectionHash,
  detectRawBytesBmdBallot,
  ELECTION_HASH_LENGTH,
} from '@votingworks/ballot-encoder';
import {
  Interpreter as HmpbInterpreter,
  metadataFromBytes,
} from '@votingworks/ballot-interpreter-vx';
import { imageDebugger, loadImageData } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  BallotType,
  ElectionDefinition,
  getContestsFromIds,
  InterpretedBmdPage,
  MarkThresholds,
  PageInterpretation,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import {
  adjudicationReasonDescription,
  assert,
  ballotAdjudicationReasons,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
import { BallotPageQrcode } from './types';
import { rootDebug } from './util/debug';
import { optionMarkStatus } from './util/option_mark_status';
import { time } from './util/perf';
import * as qrcodeWorker from './workers/qrcode';

const debug = rootDebug.extend('interpreter');

export interface InterpretFileParams {
  readonly ballotImagePath: string;
  readonly detectQrcodeResult: qrcodeWorker.Output;
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
  precinctSelection: PrecinctSelection;
  testMode: boolean;
  markThresholdOverrides?: MarkThresholds;
  skipElectionHashCheck?: boolean;
  adjudicationReasons: readonly AdjudicationReason[];
}

export class Interpreter {
  private hmpbInterpreter?: HmpbInterpreter;
  private readonly electionDefinition: ElectionDefinition;
  private readonly precinctSelection: PrecinctSelection;
  private readonly testMode: boolean;
  private readonly markThresholds: MarkThresholds;
  private readonly skipElectionHashCheck?: boolean;
  private readonly adjudicationReasons: readonly AdjudicationReason[];

  constructor({
    electionDefinition,
    testMode,
    markThresholdOverrides,
    precinctSelection,
    skipElectionHashCheck,
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
    detectQrcodeResult,
  }: InterpretFileParams): Promise<InterpretFileResult> {
    const timer = time(`interpretFile: ${ballotImagePath}`);

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

    const ballotImageData = await loadImageData(ballotImagePath);

    if (!this.skipElectionHashCheck) {
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
      const hmpbResult = await this.interpretHMPBFile(
        ballotImagePath,
        ballotImageData,
        detectQrcodeResult.qrcode
      );

      if (hmpbResult) {
        const { interpretation } = hmpbResult;
        assert(interpretation && interpretation.type === 'InterpretedHmpbPage');

        if (
          this.precinctSelection.kind !== 'AllPrecincts' &&
          interpretation.metadata.precinctId !==
            this.precinctSelection.precinctId
        ) {
          timer.end();
          return {
            interpretation: {
              type: 'InvalidPrecinctPage',
              metadata: interpretation.metadata,
            },
          };
        }
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

  private async interpretHMPBFile(
    ballotImagePath: string,
    image: ImageData,
    qrcode: BallotPageQrcode
  ): Promise<InterpretFileResult | undefined> {
    const hmpbInterpreter = this.getHmpbInterpreter();
    const { ballot, marks, mappedBallot, metadata } =
      await hmpbInterpreter.interpretBallot(
        image,
        metadataFromBytes(this.electionDefinition, Buffer.from(qrcode.data)),
        {
          flipped: qrcode.position === 'top',
          imdebug: imageDebugger(ballotImagePath, image),
        }
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
