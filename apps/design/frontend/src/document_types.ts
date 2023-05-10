export type Color = string;

interface ElementBase {
  type: unknown;
  x: number;
  y: number;
}

export interface Shape extends ElementBase {
  width: number;
  height: number;
  stroke?: Color;
  strokeWidth?: number;
  fill?: Color;
}

export interface Rectangle extends Shape {
  type: 'Rectangle';
  borderRadius?: number;
}

export interface Ellipse extends Shape {
  type: 'Ellipse';
}

export interface Box extends Omit<Rectangle, 'type'> {
  type: 'Box';
  children?: AnyElement[];
}

export type AnyElement = Rectangle | Ellipse | Box;

export interface Page {
  children: AnyElement[];
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

export interface Document {
  width: number;
  height: number;
  grid: GridDimensions;
  pages: Page[];
}
