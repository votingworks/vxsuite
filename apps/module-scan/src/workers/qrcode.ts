import { Election } from '@votingworks/types'
import makeDebug from 'debug'
import * as z from 'zod'
import { BallotPageQrcode, SheetOf } from '../types'
import { loadImageData } from '../util/images'
import { stats } from '../util/luminosity'
import { normalizeSheetMetadata } from '../util/metadata'
import { detectQRCode } from '../util/qrcode'

const debug = makeDebug('module-scan:workers:qrcode')

export const workerPath = __filename

const MINIMUM_BACKGROUND_COLOR_THRESHOLD = 200
const MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO = 0.007

export interface Input {
  action: 'detect-qrcode'
  imagePath: string
}

export type Output = BlankPageOutput | NonBlankPageOutput

export interface BlankPageOutput {
  blank: true
}

export interface NonBlankPageOutput {
  blank: false
  qrcode?: BallotPageQrcode
}

export const InputSchema = z.object({
  action: z.literal('detect-qrcode'),
  imagePath: z.string(),
})

export const OutputSchema = z.union([
  z.object({
    blank: z.literal(true),
  }),
  z.object({
    blank: z.literal(false),
    qrcode: z
      .object({
        data: z.instanceof(Uint8Array),
        position: z.enum(['top', 'bottom']),
      })
      .optional(),
  }),
])

export async function detectQrcodeInFilePath(
  imagePath: string
): Promise<Output> {
  const imageData = await loadImageData(imagePath)
  const luminosityStats = stats(imageData, {
    threshold: MINIMUM_BACKGROUND_COLOR_THRESHOLD,
  })

  if (
    luminosityStats.foreground.ratio < MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO
  ) {
    debug(
      '[path=%s] appears to be a blank page, skipping: %O',
      imagePath,
      luminosityStats
    )
    return { blank: true }
  }

  const result = await detectQRCode(imageData)
  const output: Output = {
    blank: false,
    qrcode: result
      ? {
          data: result.data,
          position: result.position,
        }
      : undefined,
  }
  return OutputSchema.parse(output)
}

/**
 * Find a ballot QR code and return its data and rough position. This runs in a
 * worker and should not be called directly.
 */
export async function call(input: unknown): Promise<Output> {
  const { imagePath } = InputSchema.parse(input)
  return await detectQrcodeInFilePath(imagePath)
}

export function normalizeSheetOutput(
  election: Election,
  output: SheetOf<Output>
): SheetOf<Output> {
  const [frontOutput, backOutput] = output
  const [
    normalizedFrontMetadata,
    normalizedBackMetadata,
  ] = normalizeSheetMetadata(election, [
    frontOutput.blank ? undefined : frontOutput.qrcode,
    backOutput.blank ? undefined : backOutput.qrcode,
  ])
  return [
    { blank: !normalizedFrontMetadata, qrcode: normalizedFrontMetadata },
    { blank: !normalizedBackMetadata, qrcode: normalizedBackMetadata },
  ]
}
