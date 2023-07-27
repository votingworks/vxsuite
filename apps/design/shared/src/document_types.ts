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

export interface TextParagraph {
  type: 'TextParagraph';
  children: TextSpan[];
  lineHeight: number;
  fontSize: number;
}

export interface TextSpan {
  type: 'TextSpan';
  text: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
}

// export interface TextList {
//   type: 'TextList';
//   items: TextParagraph[];
//   bulletType: 'circle' | 'number';
// }

export type RichText = TextParagraph; // | TextList;

export interface RichTextBox extends ElementBase {
  type: 'RichTextBox';
  width: number;
  height: number;
  children: RichText[];
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
  href: string;
}

export type AnyElement = Rectangle | TextBox | Image;

export interface Page {
  children: AnyElement[];
}

export interface Document {
  width: number;
  height: number;
  pages: Page[];
}
