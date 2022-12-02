import * as z from 'zod';
import {
  detectQrcodeInFilePath,
  Output as QrCodeOutput,
} from '@votingworks/ballot-interpreter-vx';

export const workerPath = __filename;

export interface Input {
  action: 'detect-qrcode';
  imagePath: string;
}

export type Output = QrCodeOutput;

export const InputSchema = z.object({
  action: z.literal('detect-qrcode'),
  imagePath: z.string(),
});

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
]);

/**
 * Find a ballot QR code and return its data and rough position. This runs in a
 * worker and should not be called directly.
 */
export async function call(input: unknown): Promise<Output> {
  const { imagePath } = InputSchema.parse(input);
  const output = await detectQrcodeInFilePath(imagePath);
  return OutputSchema.parse(output);
}
