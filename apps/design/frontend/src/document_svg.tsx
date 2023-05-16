import React from 'react';
import { Box, Color, Ellipse, Page, Rectangle } from './document_types';

type SvgRectangleProps = Omit<Rectangle, 'type'>;

export function SvgRectangle({
  borderRadius,
  ...props
}: SvgRectangleProps): JSX.Element {
  return <rect {...props} rx={borderRadius} ry={borderRadius} />;
}

type SvgEllipseProps = Omit<Ellipse, 'type'>;

export function SvgEllipse({
  x,
  y,
  width,
  height,
  ...props
}: SvgEllipseProps): JSX.Element {
  return (
    <ellipse
      cx={x + width / 2}
      cy={y + height / 2}
      rx={width / 2}
      ry={height / 2}
      {...props}
    />
  );
}

interface SvgBoxProps extends Omit<Box, 'type' | 'children'> {
  children?: React.ReactNode;
}

export function SvgBox({
  x,
  y,
  children,
  ...rectProps
}: SvgBoxProps): JSX.Element {
  return (
    <svg x={x} y={y}>
      <SvgRectangle x={0} y={0} {...rectProps} />
      {children}
    </svg>
  );
}

interface SvgPageProps extends Omit<Page, 'children'> {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
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
