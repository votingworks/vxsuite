import { z } from 'zod/v4';

export interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export const ImageDataSchema: z.ZodSchema<ImageData> = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  data: z.instanceof(Uint8ClampedArray),
});

export const RgbaImageData = ImageDataSchema.brand('RgbaImageData');

export interface RgbaImageData extends z.infer<typeof RgbaImageData> {}

export const GrayImageData = ImageDataSchema.brand('GrayImageData');

export interface GrayImageData extends z.infer<typeof GrayImageData> {}
