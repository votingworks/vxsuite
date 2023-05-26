import React from 'react';
import {
  ImageElement,
  Page,
  RectangleElement,
  TextBoxElement,
} from './document_types';

type SvgRectangleProps = Omit<RectangleElement, 'type'>;

export function SvgRectangle({
  x,
  y,
  width,
  height,
  fillColor,
  strokeColor,
  strokeWidth,
  borderRadius,
}: SvgRectangleProps): JSX.Element {
  const fill = fillColor ?? 'none';
  return (
    <svg x={x} y={y} overflow="visible">
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={borderRadius}
        ry={borderRadius}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth?.top} // TODO handle different widths for each side
      />
    </svg>
  );
}

type SvgTextBoxProps = Omit<TextBoxElement, 'type'>;

export function SvgTextBox({
  x,
  y,
  width,
  height,
  textLines,
  lineHeight,
  ...textProps
}: SvgTextBoxProps): JSX.Element {
  return (
    <svg x={x} y={y} width={width} height={height} overflow="visible">
      {textLines.map((textLine, index) => (
        <text
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          x={0}
          y={(index + 1) * lineHeight - lineHeight / 4}
          {...textProps}
        >
          {
            // TODO handle text span weight
            textLine.map((textSpan) => textSpan.text).join('')
          }
        </text>
      ))}
    </svg>
  );
}

type SvgImageProps = Omit<ImageElement, 'type'>;

export function SvgImage(props: SvgImageProps): JSX.Element {
  return <image {...props} />;
}

interface SvgPageProps extends Omit<Page, 'children'> {
  x?: number;
  y?: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

export function SvgPage({
  x,
  y,
  width,
  height,
  children,
}: SvgPageProps): JSX.Element {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect width={width} height={height} fill="white" />
      {children}
    </svg>
  );
}
