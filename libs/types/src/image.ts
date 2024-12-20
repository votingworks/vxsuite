import { z } from 'zod';

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
