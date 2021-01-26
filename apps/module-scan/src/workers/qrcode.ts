import makeDebug from 'debug'
import * as z from 'zod'
import { loadImageData } from '../util/images'
import { detectQRCode } from '../util/qrcode'
import threshold from '../util/threshold'

const debug = makeDebug('module-scan:workers:qrcode')

export const workerPath = __filename

const MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO = 0.005

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
  qrcode?: { data: Uint8Array; position: 'top' | 'bottom' }
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

/**
 * Find a ballot QR code and return its data and rough position. This runs in a
 * worker and should not be called directly.
 */
export async function call(input: unknown): Promise<Output> {
  const { imagePath } = InputSchema.parse(input)
  const imageData = await loadImageData(imagePath)
  const imageThreshold = threshold(imageData.data)

  if (
    imageThreshold.foreground.ratio < MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO
  ) {
    debug(
      '[path=%s] appears to be a blank page, skipping: %O',
      imagePath,
      imageThreshold
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
