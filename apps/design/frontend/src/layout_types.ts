import { Color, PixelUnit, Sides } from './document_types';

export type ShorthandSides<T> = T | { topBottom: T; leftRight: T } | Sides<T>;

export interface BoxNode {
  type: 'Box';
  padding: ShorthandSides<PixelUnit>;
  gap: PixelUnit;
  flowDirection: 'row' | 'column';
  width?: 'shrink' | 'grow';
  // height?: 'shrink' | 'grow';
  // spacing?: 'packed' | 'spaced';
  // verticalAlign?: 'top' | 'center' | 'bottom';
  // horizontalAlign?: 'left' | 'center' | 'right';
  strokeColor?: Color;
  strokeWidth?: ShorthandSides<PixelUnit>;
  fillColor?: Color;
  children: AnyNode[];
}

export interface TextSpanNode {
  type: 'TextSpan';
  text: string;
  fontWeight: number;
}

export interface TextBoxNode {
  type: 'TextBox';
  text: string | TextSpanNode | Array<string | TextSpanNode>;
  fontSize: number;
  lineHeight: PixelUnit;
}

export interface ImageNode {
  type: 'Image';
  href: string;
  originalWidth: PixelUnit;
  originalHeight: PixelUnit;
}

export type AnyNode = BoxNode | TextBoxNode | ImageNode;
