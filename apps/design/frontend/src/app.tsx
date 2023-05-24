/* eslint-disable react/destructuring-assignment */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-array-index-key */
import React from 'react';
import './polyfills';
import { AppBase } from '@votingworks/ui';
import { useEffect, useRef, useState, useMemo } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import { Election } from '@votingworks/types';
import styled from 'styled-components';
import {
  AnyElement,
  Document,
  Image,
  Page,
  Rectangle,
  TextBox,
} from './document_types';
import { SvgImage, SvgPage, SvgRectangle, SvgTextBox } from './document_svg';
import { GRID, GridDimensions, layOutBallot } from './layout';
import election from './electionFamousNames2021.json';

function replaceAtIndex<T>(array: T[], index: number, value: T): T[] {
  return [...array.slice(0, index), value, ...array.slice(index + 1)];
}

interface BaseObjectProps<T extends AnyElement> {
  element: T;
  setElement: (element: T) => void;
}

function RectangleObject({ element, setElement }: BaseObjectProps<Rectangle>) {
  return (
    <SvgRectangle {...element}>
      {element.children?.map((child, index) => {
        return (
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
        );
      })}
    </SvgRectangle>
  );
}

function TextBoxObject({ element }: BaseObjectProps<TextBox>) {
  return <SvgTextBox {...element} />;
}

function ImageObject({ element }: BaseObjectProps<Image>) {
  return <SvgImage {...element} />;
}

function AnyElementObject(props: {
  element: AnyElement;
  setElement: (element: AnyElement) => void;
}) {
  switch (props.element.type) {
    case 'Rectangle':
      return <RectangleObject {...(props as BaseObjectProps<Rectangle>)} />;
    case 'TextBox':
      return <TextBoxObject {...(props as BaseObjectProps<TextBox>)} />;
    case 'Image':
      return <ImageObject {...(props as BaseObjectProps<Image>)} />;
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
      strokeWidth={0.5}
      strokeDasharray={2}
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
      strokeWidth={0.5}
      strokeDasharray={2}
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
  showGridLines,
}: {
  x: number;
  y: number;
  grid: GridDimensions;
  width: number;
  height: number;
  page: Page;
  setPage: (page: Page) => void;
  showGridLines: boolean;
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
      {showGridLines && <GridLines {...{ grid, width, height }} />}
    </SvgPage>
  );
}

function DocumentSvg({
  dimensions,
  document,
  setDocument,
  showGridLines,
}: {
  dimensions: { width: number; height: number };
  document: Document;
  setDocument: (document: Document) => void;
  showGridLines: boolean;
}) {
  const [zoom, setZoom] = useState(0.8);
  const [panOffset, setPanOffset] = useState({ x: -100, y: -100 });
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);

  const { width, height, pages } = document;

  // Temporary optimization: memoize the pages so that we don't rerender them
  // when changing pan/zoom
  const pagesElements = useMemo(
    () =>
      pages.map((page, index) => (
        <PageObject
          x={index % 2 === 0 ? 0 : width + PAGE_GAP}
          y={Math.floor(index / 2) * (height + PAGE_GAP)}
          grid={GRID}
          width={width}
          height={height}
          page={page}
          setPage={(newPage) =>
            setDocument({
              ...document,
              pages: replaceAtIndex(pages, index, newPage),
            })
          }
          showGridLines={showGridLines}
          key={index}
        />
      )),
    [width, height, pages, document, setDocument, showGridLines]
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

const Controls = styled.div`
  display: flex;
  align-items: center;
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgba(0, 0, 0, 0.2);
  width: 100%;
  padding: 0.4rem;
  gap: 1rem;
`;

export function App(): JSX.Element {
  const [document, setDocument] = useState(
    layOutBallot(
      election as unknown as Election,
      election.precincts[0].id,
      election.districts.slice(0, 2).map((district) => district.id)
    ).document
  );
  const [showGridLines, setShowGridLines] = useState(true);

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
      <Controls>
        <button
          type="button"
          onClick={() => setShowGridLines(!showGridLines)}
          style={{ width: '100px' }}
        >
          {showGridLines ? 'Hide Grid' : 'Show Grid'}
        </button>
        <div>
          {GRID.rows} rows x {GRID.columns} columns
        </div>
      </Controls>
      <DocumentSvg
        dimensions={dimensions}
        document={document}
        setDocument={setDocument}
        showGridLines={showGridLines}
      />
    </AppBase>
  );
}
