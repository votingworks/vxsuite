import React, { useCallback } from 'react';
import { Container, Graphics } from '@inlet/react-pixi';
import type PIXI from 'pixi.js';
import { Application } from 'pixi.js';
import { Box, Ellipse, Page, Rectangle } from './document_types';

type CanvasRectangleProps = Omit<Rectangle, 'type'>;

export function CanvasRectangle({
  x,
  y,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  borderRadius,
}: CanvasRectangleProps): JSX.Element {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      if (fill !== 'none') g.beginFill(fill);
      if (stroke) {
        g.lineStyle({
          width: strokeWidth,
          color: stroke,
        });
      }
      g.drawRoundedRect(x, y, width, height, borderRadius ?? 0);
      if (fill !== 'none') g.endFill();
    },
    [x, y, width, height, fill, stroke, strokeWidth, borderRadius]
  );

  return <Graphics draw={draw} />;
}

type CanvasEllipseProps = Omit<Ellipse, 'type'>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CanvasEllipse(props: CanvasEllipseProps): JSX.Element | null {
  return null;
}

interface CanvasBoxProps extends Omit<Box, 'type' | 'children'> {
  children?: React.ReactNode;
}

export function CanvasBox({
  x,
  y,
  width,
  height,
  children,
  ...rectProps
}: CanvasBoxProps): JSX.Element {
  return (
    <Container x={x} y={y} width={width} height={height} {...rectProps}>
      {children}
    </Container>
  );
}

interface CanvasPageProps extends Omit<Page, 'children'> {
  x?: number;
  y?: number;
  width: number;
  height: number;
  children: React.ReactNode;
}
export function CanvasPage({
  x,
  y,
  width,
  height,
  children,
}: CanvasPageProps): JSX.Element {
  console.log('CanvasPage', x, y, width, height);
  return (
    <Container position={[x, y]} width={width} height={height}>
      <CanvasRectangle
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#ffffff"
      />
      {children}
    </Container>
  );
}
