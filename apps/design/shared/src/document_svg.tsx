import React from 'react';
import { Color, Image, Page, Rectangle, TextBox } from './document_types';

export const FONT_FAMILY = 'HelveticaNeue';

interface SvgRectangleProps extends Omit<Rectangle, 'type' | 'children'> {
  children?: React.ReactNode;
}

export function SvgRectangle({
  x,
  y,
  borderRadius,
  fill,
  children,
  ...rectProps
}: SvgRectangleProps): JSX.Element {
  // eslint-disable-next-line no-param-reassign
  fill = fill ?? 'none';
  return (
    <svg x={x} y={y} overflow="visible">
      <rect
        x={0}
        y={0}
        rx={borderRadius}
        ry={borderRadius}
        fill={fill}
        {...rectProps}
      />
      {children}
    </svg>
  );
}

type SvgTextBoxProps = Omit<TextBox, 'type'>;

export function SvgTextBox({
  x,
  y,
  width,
  height,
  textLines,
  lineHeight,
  align = 'left',
  ...textProps
}: SvgTextBoxProps): JSX.Element {
  return (
    <svg x={x} y={y} width={width} height={height}>
      {textLines.map((textLine, index) => (
        <text
          // eslint-disable-next-line react/no-array-index-key
          key={textLine + index}
          // Adjust x coordinate if textAnchor is 'end' so that the overall
          // content box location stays the same, since 'end' moves the text to
          // the other side of the x coordinate.
          x={align === 'left' ? 0 : width}
          y={(index + 1) * lineHeight}
          textAnchor={align === 'left' ? 'start' : 'end'}
          {...textProps}
        >
          {textLine}
        </text>
      ))}
    </svg>
  );
}

export type SvgImageProps = Omit<Image, 'type'>;

export function SvgImage(props: SvgImageProps): JSX.Element {
  return <image {...props} />;
}

interface SvgPageProps extends Omit<Page, 'children'> {
  x?: number;
  y?: number;
  width: number;
  height: number;
  stroke?: Color;
  strokeWidth?: number;
  children: React.ReactNode;
}

export function SvgPage({
  x,
  y,
  width,
  height,
  stroke,
  strokeWidth,
  children,
}: SvgPageProps): JSX.Element {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={FONT_FAMILY}
    >
      <rect
        width={width}
        height={height}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="white"
      />
      {children}
    </svg>
  );
}
