import { GridPosition } from '@votingworks/types';

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
  children?: AnyElement[];
}

export interface TextBox extends ElementBase {
  type: 'TextBox';
  width: number;
  height: number;
  textLines: string[]; // TODO support spans for rich text styling
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  align?: 'left' | 'right';
}

export interface Image extends ElementBase {
  type: 'Image';
  width: number;
  height: number;
  href?: string;
  contents?: string; // SVG text
}

export interface Bubble extends Shape {
  type: 'Bubble';
  borderRadius?: number;
  gridPosition: GridPosition;
}

export type AnyElement = Rectangle | TextBox | Image | Bubble;

export interface Page {
  children: AnyElement[];
}

export interface Document {
  width: number;
  height: number;
  pages: Page[];
}
