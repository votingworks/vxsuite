//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  AdjudicationReason,
  Contests,
  decodeBallot,
  detect,
  Election,
  VotesDict,
  BallotType,
} from '@votingworks/ballot-encoder'
import {
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  Interpreter as HMPBInterpreter,
  metadataFromBytes,
  Size,
} from '@votingworks/hmpb-interpreter'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'
import { decode as quircDecode } from 'node-quirc'
import sharp from 'sharp'
import {
  BallotMetadata,
  getMarkStatus,
  isErrorResult,
  Result,
  SheetOf,
} from './types'
import { AdjudicationInfo, MarkStatus } from './types/ballot-review'
import ballotAdjudicationReasons, {
  adjudicationReasonDescription,
} from './util/ballotAdjudicationReasons'
import threshold from './util/threshold'

const MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO = 0.005

const debug = makeDebug('module-scan:interpreter')

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
  readonly ballotImageFile: Buffer
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

export interface Interpreter {
  addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  interpretFile(
    interpretFileParams: InterpretFileParams
  ): Promise<InterpretFileResult>
  setTestMode(testMode: boolean): void
}

interface BallotImageData {
  file: Buffer
  image: ImageData
  qrcode: Buffer
}

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string
}

function maybeDecodeBase64(data: Buffer): Buffer {
  try {
    if (typeof detect(data) !== 'undefined') {
      // BMD ballot, leave it
      return data
    }

    const base64string = new TextDecoder().decode(data)

    if (!isBase64(base64string)) {
      // not base64, leave it
      return data
    }
    const decodedData = Buffer.from(base64string, 'base64')
    return decodedData
  } catch {
    return data
  }
}

async function getQRCode(
  encodedImageData: Buffer,
  decodedImageData: Buffer,
  width: number,
  height: number
): Promise<Buffer | undefined> {
  const [quircCode] = await quircDecode(encodedImageData)

  if (quircCode && 'data' in quircCode) {
    return maybeDecodeBase64(quircCode.data)
  }

  const qrdetectCodes = qrdetect(decodedImageData, width, height)

  if (qrdetectCodes.length > 0) {
    return maybeDecodeBase64(qrdetectCodes[0].data)
  }
}

export async function getBallotImageData(
  file: Buffer,
  filename: string
): Promise<Result<PageInterpretation, BallotImageData>> {
  const img = sharp(file).raw().ensureAlpha()
  const {
    data,
    info: { width, height },
  } = await img.toBuffer({ resolveWithObject: true })

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
  const clipHeight = Math.floor(height / 4)
  const topCrop = img
    .clone()
    .extract({ left: 0, top: 0, width, height: clipHeight })

  const topRaw = await topCrop.toBuffer()
  const topImage = await topCrop.png().toBuffer()
  const topQrcode = await getQRCode(topImage, topRaw, width, clipHeight)

  if (topQrcode) {
    return { value: { file, image, qrcode: topQrcode } }
  }

  const bottomCrop = img.clone().extract({
    left: 0,
    top: height - clipHeight,
    width,
    height: clipHeight,
  })
  const bottomRaw = await bottomCrop.toBuffer()
  const bottomImage = await bottomCrop.png().toBuffer()
  const bottomQrcode = await getQRCode(
    bottomImage,
    bottomRaw,
    width,
    clipHeight
  )

  if (bottomQrcode) {
    return { value: { file, image, qrcode: bottomQrcode } }
  }

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
export function sheetRequiresAdjudication([front, back]: SheetOf<
  PageInterpretation
>): boolean {
  const [
    frontRequiresAdjudicationNonBlank,
    backRequiresAdjudicationNonBlank,
  ] = [front, back].map(
    (pi) =>
      pi.type === 'UninterpretedHmpbPage' ||
      pi.type === 'UnreadablePage' ||
      pi.type === 'InvalidTestModePage' ||
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

export default class SummaryBallotInterpreter implements Interpreter {
  private hmpbInterpreter?: HMPBInterpreter
  private testMode?: boolean

  async addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    imageDataOrLayout: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    const interpreter = this.getHmbpInterpreter(election)
    let layout: BallotPageLayout

    if ('data' in imageDataOrLayout) {
      layout = await interpreter.interpretTemplate(imageDataOrLayout, metadata)
    } else {
      layout = imageDataOrLayout
    }

    ;({ metadata } = layout.ballotImage)

    if (metadata.isTestMode === this.testMode) {
      await interpreter.addTemplate(layout)
    }

    debug(
      'Added HMPB template page %d: ballotStyleId=%s precinctId=%s isTestMode=%s',
      metadata.pageNumber,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestMode
    )

    return layout
  }

  public async interpretFile({
    election,
    ballotImagePath,
    ballotImageFile,
  }: InterpretFileParams): Promise<InterpretFileResult> {
    const result = await getBallotImageData(ballotImageFile, ballotImagePath)

    if (isErrorResult(result)) {
      return { interpretation: result.error }
    }

    const ballotImageData = result.value
    const bmdResult = await this.interpretBMDFile(election, ballotImageData)

    if (bmdResult) {
      return bmdResult
    }

    try {
      const hmpbResult = await this.interpretHMPBFile(election, ballotImageData)

      if (hmpbResult) {
        return hmpbResult
      }
    } catch (error) {
      debug('interpretHMPBFile failed: %s', error.message)
    }

    try {
      debug(
        'assuming ballot is a HMPB that could not be interpreted (QR data: %s)',
        new TextDecoder().decode(ballotImageData.qrcode)
      )
      const metadata = metadataFromBytes(election, ballotImageData.qrcode)

      if (metadata.isTestMode !== this.testMode) {
        debug(
          'cannot process a HMPB with isTestMode=%s when testMode=%s',
          metadata.isTestMode,
          this.testMode
        )
        return {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata,
          },
        }
      }

      return {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata,
        },
      }
    } catch (error) {
      return {
        interpretation: {
          type: 'UnreadablePage',
          reason: error.message,
        },
      }
    }
  }

  public setTestMode(testMode: boolean): void {
    this.testMode = testMode
    this.hmpbInterpreter = undefined
  }

  private async interpretBMDFile(
    election: Election,
    { qrcode }: BallotImageData
  ): Promise<InterpretFileResult | undefined> {
    if (typeof detect(qrcode) === 'undefined') {
      return
    }

    const { ballot } = decodeBallot(election, qrcode)

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

  private async interpretHMPBFile(
    election: Election,
    { image }: BallotImageData
  ): Promise<InterpretFileResult | undefined> {
    const hmpbInterpreter = this.getHmbpInterpreter(election)
    const {
      ballot,
      marks,
      mappedBallot,
      metadata,
    } = await hmpbInterpreter.interpretBallot(image)
    const { votes } = ballot

    let requiresAdjudication = false
    const enabledReasons = election.adjudicationReasons ?? [
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
          optionMarkStatus: (contestId, optionId) => {
            for (const mark of marks) {
              if (mark.type === 'stray' || mark.contest.id !== contestId) {
                continue
              }

              if (mark.type !== 'candidate' && mark.type !== 'yesno') {
                throw new Error(
                  `contest type is not yet supported: ${mark.type}`
                )
              }

              if (
                (mark.type === 'candidate' && mark.option.id === optionId) ||
                (mark.type === 'yesno' && mark.option === optionId)
              ) {
                return getMarkStatus(mark, election.markThresholds!)
              }
            }

            return MarkStatus.Unmarked
          },
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

  private getHmbpInterpreter(election: Election): HMPBInterpreter {
    if (!this.hmpbInterpreter) {
      if (typeof this.testMode === 'undefined') {
        throw new Error(
          'testMode has not been configured; please set it to true or false before interpreting ballots'
        )
      }

      this.hmpbInterpreter = new HMPBInterpreter({
        election,
        testMode: this.testMode,
      })
    }
    return this.hmpbInterpreter
  }
}
