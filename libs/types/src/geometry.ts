import { z } from 'zod';

export interface Point<T = number> {
  readonly x: T;
  readonly y: T;
}
export const PointSchema: z.ZodSchema<Point> = z.object({
  x: z.number(),
  y: z.number(),
});

export interface Offset<T = number> {
  readonly x: T;
  readonly y: T;
}
export const OffsetSchema: z.ZodSchema<Offset> = z.object({
  x: z.number(),
  y: z.number(),
});

export interface Rect<T = number> {
  readonly x: T;
  readonly y: T;
  readonly width: T;
  readonly height: T;
}
export const RectSchema: z.ZodSchema<Rect> = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export interface Outset<T extends number = number> {
  readonly top: T;
  readonly right: T;
  readonly bottom: T;
  readonly left: T;
}

export const OutsetSchema: z.ZodSchema<Outset> = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

export type Corners<T = number> = readonly [
  topLeft: Point<T>,
  topRight: Point<T>,
  bottomLeft: Point<T>,
  bottomRight: Point<T>,
];
export const CornersSchema: z.ZodSchema<Corners> = z.tuple([
  PointSchema,
  PointSchema,
  PointSchema,
  PointSchema,
]);

export interface Size<T = number> {
  readonly width: T;
  readonly height: T;
}
export const SizeSchema: z.ZodSchema<Size> = z.object({
  width: z.number(),
  height: z.number(),
});
