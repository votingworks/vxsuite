/* eslint-disable react/destructuring-assignment */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-array-index-key */
import './polyfills';
import { AppBase } from '@votingworks/ui';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import { Stage, Text } from '@inlet/react-pixi';
import {
  AnyElement,
  Box,
  Color,
  Document,
  Ellipse,
  GridDimensions,
  Page,
  Rectangle,
} from './document_types';
import { SvgBox, SvgEllipse, SvgPage, SvgRectangle } from './document_svg';
import { allBubbleBallots } from './all_bubble_ballots';
import { CanvasBox, CanvasPage, CanvasRectangle } from './document_canvas';

function replaceAtIndex<T>(array: T[], index: number, value: T): T[] {
  return [...array.slice(0, index), value, ...array.slice(index + 1)];
}

function randomColor(): Color {
  return `hsl(${Math.random() * 360}, 100%, 50%)`;
}

interface BaseObjectProps<T extends AnyElement> {
  element: T;
  setElement: (element: T) => void;
}

function RectangleObject({ element, setElement }: BaseObjectProps<Rectangle>) {
  return <CanvasRectangle {...element} />;
}

function EllipseObject({ element, setElement }: BaseObjectProps<Ellipse>) {
  return null;
}

function BoxObject({ element, setElement }: BaseObjectProps<Box>) {
  return (
    <CanvasBox {...element}>
      {element.children?.map((child, index) => (
        <AnyElementObject
          key={index}
          element={child}
          setElement={(newChild) => {
            setElement({
              ...element,
              children:
                element.children &&
                replaceAtIndex(element.children, index, newChild),
            });
          }}
        />
      ))}
    </CanvasBox>
  );
}

function AnyElementObject(props: {
  element: AnyElement;
  setElement: (element: AnyElement) => void;
}) {
  switch (props.element.type) {
    case 'Rectangle':
      return <RectangleObject {...(props as BaseObjectProps<Rectangle>)} />;
    case 'Ellipse':
      return <EllipseObject {...(props as BaseObjectProps<Ellipse>)} />;
    case 'Box':
      return <BoxObject {...(props as BaseObjectProps<Box>)} />;
    default:
      return throwIllegalValue(props.element);
  }
}

function GridLines({
  grid,
  width,
  height,
}: {
  grid: GridDimensions;
  width: number;
  height: number;
}) {
  const rowGap = height / (grid.rows + 1);
  const columnGap = width / (grid.columns + 1);
  const rowLines = Array.from({ length: grid.rows }).map((_, row) => (
    <line
      key={row}
      x1={0}
      y1={(row + 1) * rowGap}
      x2={width}
      y2={(row + 1) * rowGap}
      stroke="red"
      strokeWidth={1.5}
      strokeDasharray="5 5"
    />
  ));
  const columnLines = Array.from({ length: grid.columns }).map((_, column) => (
    <line
      key={column}
      x1={(column + 1) * columnGap}
      y1={0}
      x2={(column + 1) * columnGap}
      y2={height}
      stroke="red"
      strokeWidth={1.5}
      strokeDasharray="5 5"
    />
  ));
  return (
    <g>
      {rowLines}
      {columnLines}
    </g>
  );
}

const PAGE_GAP = 100;

function PageObject({
  x,
  y,
  width,
  height,
  grid,
  page,
  setPage,
}: {
  x: number;
  y: number;
  grid: GridDimensions;
  width: number;
  height: number;
  page: Page;
  setPage: (page: Page) => void;
}) {
  return (
    <CanvasPage {...{ x, y, width, height, ...page }}>
      {page.children.map((element, index) => (
        <AnyElementObject
          key={index}
          element={element}
          setElement={(newElement) => {
            setPage({
              ...page,
              children: replaceAtIndex(page.children, index, newElement),
            });
          }}
        />
      ))}
      {/* <GridLines {...{ grid, width, height }} /> */}
    </CanvasPage>
  );
}

function DocumentCanvas({
  dimensions,
  document,
  setDocument,
}: {
  dimensions: { width: number; height: number };
  document: Document;
  setDocument: (document: Document) => void;
}) {
  const { pages, width, height, grid } = document;
  console.log('DocumentCanvas', dimensions, width, height);
  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    <Stage {...dimensions} options={{ backgroundAlpha: 0, antialias: true }}>
      {pages.map((page, index) => (
        <PageObject
          x={index % 2 === 0 ? 0 : width + PAGE_GAP}
          y={Math.floor(index / 2) * (height + PAGE_GAP)}
          grid={grid}
          width={width}
          height={height}
          page={page}
          setPage={(newPage) =>
            setDocument({
              ...document,
              pages: replaceAtIndex(pages, index, newPage),
            })
          }
          key={index}
        />
      ))}
    </Stage>
  );
}

export function App(): JSX.Element {
  const [document, setDocument] = useState(
    allBubbleBallots.cycling.ballotDocument
  );

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function callback() {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  }, []);

  return (
    <AppBase>
      <button
        type="button"
        onClick={() =>
          setDocument(
            document === allBubbleBallots.cycling.ballotDocument
              ? allBubbleBallots.blank.ballotDocument
              : allBubbleBallots.cycling.ballotDocument
          )
        }
      >
        Change ballot
      </button>
      <DocumentCanvas
        dimensions={dimensions}
        document={document}
        setDocument={setDocument}
      />
    </AppBase>
  );
}
