import { z } from 'zod/v4';

export const PointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .readonly();

export interface Point extends z.infer<typeof PointSchema> {}

export const OffsetSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .readonly();

export interface Offset extends z.infer<typeof OffsetSchema> {}

export const RectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .readonly();

export interface Rect extends z.infer<typeof RectSchema> {}

export const OutsetSchema = z
  .object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  })
  .readonly();

export interface Outset<T extends number = number>
  extends Omit<z.infer<typeof OutsetSchema>, 'top' | 'right' | 'bottom' | 'left'> {
  readonly top: T;
  readonly right: T;
  readonly bottom: T;
  readonly left: T;
}

export const CornersSchema = z.tuple([
  PointSchema,
  PointSchema,
  PointSchema,
  PointSchema,
]);

export type Corners = readonly [
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
];

export const SizeSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .readonly();

export interface Size extends z.infer<typeof SizeSchema> {}
