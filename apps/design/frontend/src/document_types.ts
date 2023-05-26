export type Color = string;
export type PixelUnit = number;

export interface Sides<T> {
  top: T;
  bottom: T;
  left: T;
  right: T;
}

interface ElementBase {
  type: unknown;
  x: PixelUnit;
  y: PixelUnit;
  width: PixelUnit;
  height: PixelUnit;
}

export interface RectangleElement extends ElementBase {
  type: 'Rectangle';
  borderRadius?: PixelUnit;
  strokeColor?: Color;
  strokeWidth?: Sides<PixelUnit>;
  fillColor?: Color;
}

export interface TextSpanElement {
  type: 'TextSpan';
  text: string;
  fontWeight: number;
}

export interface TextBoxElement extends ElementBase {
  type: 'TextBox';
  textLines: Array<TextSpanElement[]>;
  fontSize: number;
  lineHeight: PixelUnit;
}

export interface ImageElement extends ElementBase {
  type: 'Image';
  href: string;
}

export type AnyElement = RectangleElement | TextBoxElement | ImageElement;

export interface Page {
  children: AnyElement[];
}

export interface Document {
  width: PixelUnit;
  height: PixelUnit;
  pages: Page[];
}
