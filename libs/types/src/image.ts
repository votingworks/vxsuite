import { z } from 'zod/v4';

export const ImageDataSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  data: z.instanceof(Uint8ClampedArray),
});

export interface ImageData extends z.infer<typeof ImageDataSchema> {}
