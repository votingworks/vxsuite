import * as z from 'zod'
import { loadImageData } from '../util/images'
import { detectQRCode } from '../util/qrcode'

export const workerPath = __filename

export interface Input {
  imagePath: string
}

export type Output =
  | { data: Uint8Array; position: 'top' | 'bottom' }
  | undefined

export const InputSchema = z.object({
  imagePath: z.string(),
})

export const OutputSchema = z
  .object({
    data: z.instanceof(Uint8Array),
    position: z.enum(['top', 'bottom']),
  })
  .optional()

/**
 * Find a ballot QR code and return its data and rough position. This runs in a
 * worker and should not be called directly.
 */
export async function call(input: unknown): Promise<Output> {
  const { imagePath } = InputSchema.parse(input)
  const result = await detectQRCode(await loadImageData(imagePath))
  if (result) {
    return OutputSchema.parse({
      data: result.data,
      position: result.position,
    })
  }
}
