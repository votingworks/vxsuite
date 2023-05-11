/* eslint-disable react/destructuring-assignment */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-array-index-key */
import './polyfills';
import { AppBase } from '@votingworks/ui';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
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
  return (
    <g
      onClick={() => {
        setElement({
          ...element,
          fill: randomColor(),
        });
      }}
    >
      <SvgRectangle {...element} />
    </g>
  );
}

function EllipseObject({ element, setElement }: BaseObjectProps<Ellipse>) {
  return (
    <g
      onClick={() => {
        setElement({
          ...element,
          fill: randomColor(),
        });
      }}
    >
      <SvgEllipse {...element} />
    </g>
  );
}

function BoxObject({ element, setElement }: BaseObjectProps<Box>) {
  return (
    <g
      onClick={() => {
        setElement({
          ...element,
          fill: randomColor(),
        });
      }}
    >
      <SvgBox {...element}>
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
      </SvgBox>
    </g>
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
    <SvgPage {...{ x, y, width, height, ...page }}>
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
      <GridLines {...{ grid, width, height }} />
    </SvgPage>
  );
}

function DocumentSvg({
  dimensions,
  document,
  setDocument,
}: {
  dimensions: { width: number; height: number };
  document: Document;
  setDocument: (document: Document) => void;
}) {
  const [zoom, setZoom] = useState(0.2);
  const [panOffset, setPanOffset] = useState({ x: -100, y: -100 });
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);

  const { width, height, grid, pages } = document;

  // Temporary optimization: memoize the pages so that we don't rerender them
  // when changing pan/zoom
  const pagesElements = useMemo(
    () =>
      pages.map((page, index) => (
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
      )),
    [width, height, grid, pages, document, setDocument]
  );
  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox={`${panOffset.x} ${panOffset.y} ${dimensions.width / zoom} ${
        dimensions.height / zoom
      }`}
      onMouseDown={(event) => {
        if (event.button === 0 && !dragStartPosition.current) {
          dragStartPosition.current = {
            x: panOffset.x + event.clientX / zoom,
            y: panOffset.y + event.clientY / zoom,
          };
        }
      }}
      onMouseMove={(event) => {
        if (dragStartPosition.current) {
          setPanOffset({
            x: dragStartPosition.current.x - event.clientX / zoom,
            y: dragStartPosition.current.y - event.clientY / zoom,
          });
        }
      }}
      onMouseUp={() => {
        dragStartPosition.current = null;
      }}
      onMouseLeave={() => {
        dragStartPosition.current = null;
      }}
      onWheel={(event) => {
        if (event.metaKey) {
          setZoom((prevZoom) => prevZoom * (1 - event.deltaY / 1000));
        } else {
          setPanOffset((prevPanOffset) => ({
            x: prevPanOffset.x + event.deltaX / zoom,
            y: prevPanOffset.y + event.deltaY / zoom,
          }));
        }
      }}
    >
      {pagesElements}
    </svg>
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
      <DocumentSvg
        dimensions={dimensions}
        document={document}
        setDocument={setDocument}
      />
    </AppBase>
  );
}
