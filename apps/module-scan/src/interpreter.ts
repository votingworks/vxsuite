//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  AdjudicationReason,
  BallotType,
  Contests,
  Election,
  MarkThresholds,
  VotesDict,
} from '@votingworks/types'
import { decodeBallot, detect } from '@votingworks/ballot-encoder'
import {
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  DetectQRCodeResult,
  Interpreter as HMPBInterpreter,
  metadataFromBytes,
  Size,
} from '@votingworks/hmpb-interpreter'
import makeDebug from 'debug'
import {
  BallotMetadata,
  BallotPageQrcode,
  isErrorResult,
  Result,
  SheetOf,
} from './types'
import { AdjudicationInfo } from './types/ballot-review'
import ballotAdjudicationReasons, {
  adjudicationReasonDescription,
} from './util/ballotAdjudicationReasons'
import { loadImageData } from './util/images'
import optionMarkStatus from './util/optionMarkStatus'
import { time } from './util/perf'
import { detectQRCode } from './util/qrcode'
import threshold from './util/threshold'

const MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO = 0.005

const debug = makeDebug('module-scan:interpreter')

export interface InterpretFileParams {
  readonly ballotImagePath: string
  readonly ballotImageFile: Buffer
  readonly ballotPageQrcode?: BallotPageQrcode
}

export interface InterpretFileResult {
  interpretation: PageInterpretation
  normalizedImage?: ImageData
}

export interface MarkInfo {
  marks: BallotMark[]
  ballotSize: Size
}

export type PageInterpretation =
  | BlankPage
  | InterpretedBmdPage
  | InterpretedHmpbPage
  | InvalidElectionHashPage
  | InvalidTestModePage
  | UninterpretedHmpbPage
  | UnreadablePage

export interface BlankPage {
  type: 'BlankPage'
}

export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage'
  ballotId: string
  metadata: BallotMetadata
  votes: VotesDict
}

export interface InterpretedHmpbPage {
  type: 'InterpretedHmpbPage'
  ballotId?: string
  metadata: BallotPageMetadata
  markInfo: MarkInfo
  votes: VotesDict
  adjudicationInfo: AdjudicationInfo
}

export interface InvalidElectionHashPage {
  type: 'InvalidElectionHashPage'
  expectedElectionHash: string
  actualElectionHash: string
}

export interface InvalidTestModePage {
  type: 'InvalidTestModePage'
  metadata: BallotMetadata | BallotPageMetadata
}

export interface UninterpretedHmpbPage {
  type: 'UninterpretedHmpbPage'
  metadata: BallotPageMetadata
}

export interface UnreadablePage {
  type: 'UnreadablePage'
  reason?: string
}

interface BallotImageData {
  file: Buffer
  image: ImageData
  qrcode: BallotPageQrcode
}

export async function getBallotImageData(
  file: Buffer,
  filename: string,
  qrcode?: BallotPageQrcode
): Promise<Result<PageInterpretation, BallotImageData>> {
  const { data, width, height } = await loadImageData(file)
  const imageThreshold = threshold(data)
  if (
    imageThreshold.foreground.ratio < MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO
  ) {
    debug(
      'interpretFile [path=%s] appears to be a blank page, skipping: %O',
      filename,
      imageThreshold
    )
    return { error: { type: 'BlankPage' } }
  }

  const image = { data: Uint8ClampedArray.from(data), width, height }
  qrcode ??= await detectQRCode(image)

  if (qrcode) {
    return { value: { file, image, qrcode } }
  }

  debug('no QR code found in %s', filename)
  return {
    error: {
      type: 'UnreadablePage',
      reason: 'No QR code found',
    },
  }
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
    return false
  }

  const [
    frontRequiresAdjudicationNonBlank,
    backRequiresAdjudicationNonBlank,
  ] = [front, back].map(
    (pi) =>
      pi.type === 'UninterpretedHmpbPage' ||
      pi.type === 'UnreadablePage' ||
      pi.type === 'InvalidTestModePage' ||
      pi.type === 'InvalidElectionHashPage' ||
      (pi.type === 'InterpretedHmpbPage' &&
        pi.adjudicationInfo.requiresAdjudication &&
        !pi.adjudicationInfo.allReasonInfos.some(
          (reasonInfo) => reasonInfo.type === AdjudicationReason.BlankBallot
        ))
  )

  // non-blank adjudication reasons are "dominant" traits: one page triggers adjudication
  if (frontRequiresAdjudicationNonBlank || backRequiresAdjudicationNonBlank) {
    return true
  }

  // Always require adjudication of pairs with HMPB & something else.
  if (
    (front.type === 'InterpretedHmpbPage' &&
      back.type !== 'InterpretedHmpbPage') ||
    (back.type === 'InterpretedHmpbPage' &&
      front.type !== 'InterpretedHmpbPage')
  ) {
    return true
  }

  const [frontIsBlankHmpbPage, backIsBlankHmpbPage] = [front, back].map(
    (pi) =>
      pi.type === 'BlankPage' || // truly blank page matters whether or not it's an adjudication reason.
      (pi.type === 'InterpretedHmpbPage' &&
        (pi.markInfo.marks.length === 0 || // no potential marks == automatic blank
          (pi.adjudicationInfo.requiresAdjudication &&
            pi.adjudicationInfo.allReasonInfos.some(
              (reasonInfo) => reasonInfo.type === AdjudicationReason.BlankBallot
            ))))
  )

  // blank-page adjudication is a "recessive" trait: both pages need to be blank to trigger
  return frontIsBlankHmpbPage && backIsBlankHmpbPage
}

export default class Interpreter {
  private hmpbInterpreter?: HMPBInterpreter
  private election: Election
  private testMode: boolean
  private markThresholds: MarkThresholds

  public constructor(election: Election, testMode: boolean) {
    this.election = election
    this.testMode = testMode

    const { markThresholds } = election

    if (!markThresholds) {
      throw new Error('missing mark thresholds')
    }

    this.markThresholds = markThresholds
  }

  async addHmpbTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(layout: BallotPageLayout): Promise<BallotPageLayout>
  async addHmpbTemplate(
    imageDataOrLayout: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    const interpreter = this.getHmbpInterpreter()
    let layout: BallotPageLayout

    if ('data' in imageDataOrLayout) {
      layout = await interpreter.interpretTemplate(imageDataOrLayout, metadata)
    } else {
      layout = imageDataOrLayout
    }

    ;({ metadata } = layout.ballotImage)

    debug(
      'Adding HMPB template page %d: ballotStyleId=%s precinctId=%s isTestMode=%s',
      metadata.pageNumber,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestMode
    )

    if (metadata.isTestMode === this.testMode) {
      debug(
        'template test mode (%s) matches current test mode (%s), adding to underlying interpreter',
        metadata.isTestMode,
        this.testMode
      )
      await interpreter.addTemplate(layout)
    } else {
      debug(
        'template test mode (%s) does not match current test mode (%s), skipping',
        metadata.isTestMode,
        this.testMode
      )
    }

    return layout
  }

  public async interpretFile({
    ballotImagePath,
    ballotImageFile,
    ballotPageQrcode,
  }: InterpretFileParams): Promise<InterpretFileResult> {
    const timer = time(`interpretFile: ${ballotImagePath}`)
    const result = await getBallotImageData(
      ballotImageFile,
      ballotImagePath,
      ballotPageQrcode
    )

    if (isErrorResult(result)) {
      timer.end()
      return { interpretation: result.error }
    }

    const ballotImageData = result.value
    const bmdResult = await this.interpretBMDFile(ballotImageData)

    if (bmdResult) {
      const bmdMetadata = (bmdResult.interpretation as InterpretedBmdPage)
        .metadata
      if (bmdMetadata.isTestMode === this.testMode) {
        timer.end()
        return bmdResult
      } else {
        timer.end()
        return {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: bmdMetadata,
          },
        }
      }
    }

    try {
      const hmpbResult = await this.interpretHMPBFile(ballotImageData)

      if (hmpbResult) {
        timer.end()
        return hmpbResult
      }
    } catch (error) {
      debug('interpretHMPBFile failed: %s', error.message)
    }

    try {
      debug(
        'assuming ballot is a HMPB that could not be interpreted (QR data: %s)',
        new TextDecoder().decode(ballotImageData.qrcode.data)
      )
      const metadata = metadataFromBytes(
        this.election,
        Buffer.from(ballotImageData.qrcode.data)
      )

      if (metadata.isTestMode !== this.testMode) {
        debug(
          'cannot process a HMPB with isTestMode=%s when testMode=%s',
          metadata.isTestMode,
          this.testMode
        )
        timer.end()
        return {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata,
          },
        }
      }

      timer.end()
      return {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata,
        },
      }
    } catch (error) {
      timer.end()
      return {
        interpretation: {
          type: 'UnreadablePage',
          reason: error.message,
        },
      }
    }
  }

  public electionDidChange(): void {
    this.hmpbInterpreter = undefined
  }

  private async interpretBMDFile({
    qrcode,
  }: BallotImageData): Promise<InterpretFileResult | undefined> {
    if (!detect(qrcode.data)) {
      return
    }

    debug('decoding BMD ballot: %o', qrcode)
    const ballot = decodeBallot(this.election, qrcode.data)
    debug('decoded BMD ballot: %o', ballot.votes)

    return {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: ballot.ballotId,
        metadata: {
          electionHash: '',
          ballotType: BallotType.Standard,
          locales: { primary: 'en-US' },
          ballotStyleId: ballot.ballotStyle.id,
          precinctId: ballot.precinct.id,
          isTestMode: ballot.isTestMode,
        },
        votes: ballot.votes,
      },
    }
  }

  private async interpretHMPBFile({
    image,
    qrcode,
  }: BallotImageData): Promise<InterpretFileResult | undefined> {
    const hmpbInterpreter = this.getHmbpInterpreter()
    const {
      ballot,
      marks,
      mappedBallot,
      metadata,
    } = await hmpbInterpreter.interpretBallot(
      image,
      metadataFromBytes(this.election, Buffer.from(qrcode.data)),
      { flipped: qrcode.position === 'top' }
    )
    const { votes } = ballot

    let requiresAdjudication = false
    const enabledReasons = this.election.adjudicationReasons ?? [
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.MarginalMark,
    ]

    const allReasonInfos = [
      ...ballotAdjudicationReasons(
        marks.reduce<Contests>(
          (contests, mark) =>
            mark.type === 'stray' ||
            contests.some(({ id }) => id === mark.contest.id)
              ? contests
              : [...contests, mark.contest],
          []
        ),
        {
          optionMarkStatus: (contestId, optionId) =>
            optionMarkStatus({
              markThresholds: this.markThresholds,
              marks,
              contestId,
              optionId,
            }),
        }
      ),
    ]

    for (const reason of allReasonInfos) {
      if (enabledReasons.includes(reason.type)) {
        requiresAdjudication = true
        debug(
          'Adjudication required for reason: %s',
          adjudicationReasonDescription(reason)
        )
      } else {
        debug(
          'Adjudication reason ignored by configuration: %s',
          adjudicationReasonDescription(reason)
        )
      }
    }

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
          allReasonInfos,
        },
      },
      normalizedImage: mappedBallot,
    }
  }

  private getHmbpInterpreter(): HMPBInterpreter {
    if (!this.hmpbInterpreter) {
      if (typeof this.testMode === 'undefined') {
        throw new Error(
          'testMode has not been configured; please set it to true or false before interpreting ballots'
        )
      }

      this.hmpbInterpreter = new HMPBInterpreter({
        election: this.election,
        testMode: this.testMode,
        detectQRCode: async (
          imageData
        ): Promise<DetectQRCodeResult | undefined> => {
          const result = await detectQRCode(imageData)

          if (result) {
            return {
              data: result.data,
              rightSideUp: result.position === 'bottom',
            }
          }
        },
      })
    }
    return this.hmpbInterpreter
  }
}
