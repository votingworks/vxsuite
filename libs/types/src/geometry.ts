import { z } from 'zod';

export interface Point {
  readonly x: number;
  readonly y: number;
}
export const PointSchema: z.ZodSchema<Point> = z.object({
  x: z.number(),
  y: z.number(),
});

export interface Offset {
  readonly x: number;
  readonly y: number;
}
export const OffsetSchema: z.ZodSchema<Offset> = z.object({
  x: z.number(),
  y: z.number(),
});

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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

export type Corners = readonly [
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
];
export const CornersSchema: z.ZodSchema<Corners> = z.tuple([
  PointSchema,
  PointSchema,
  PointSchema,
  PointSchema,
]);

export interface Size {
  readonly width: number;
  readonly height: number;
}
export const SizeSchema: z.ZodSchema<Size> = z.object({
  width: z.number(),
  height: z.number(),
});
