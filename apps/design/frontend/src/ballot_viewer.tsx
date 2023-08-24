/* eslint-disable react/no-array-index-key */
import { useRef, useState, useMemo, useCallback } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import {
  BallotPaperSize,
  BallotStyle,
  Election,
  Precinct,
} from '@votingworks/types';
import styled from 'styled-components';
import { Button, H1, H3, P } from '@votingworks/ui';
import {
  AnyElement,
  Document,
  Page,
  SvgImage,
  SvgPage,
  SvgRectangle,
  SvgTextBox,
  GridDimensions,
  layOutBallot,
  gridForPaper,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { exportBallot } from './api';
import { ElectionIdParams, routes } from './routes';
import { Breadcrumbs } from './layout';

function SvgAnyElement({ element }: { element: AnyElement }) {
  switch (element.type) {
    case 'Rectangle':
      return (
        <SvgRectangle {...element}>
          {element.children?.map((child, index) => {
            return <SvgAnyElement key={index} element={child} />;
          })}
        </SvgRectangle>
      );
    case 'TextBox':
      return <SvgTextBox {...element} />;
    case 'Image':
      return <SvgImage {...element} />;
    default:
      throwIllegalValue(element);
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

const PAGE_GAP = 50;

function PageObject({
  x,
  y,
  width,
  height,
  page,
  grid,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  page: Page;
  grid?: GridDimensions;
}) {
  return (
    <SvgPage {...{ x, y, width, height, ...page }}>
      {page.children.map((element, index) => (
        <SvgAnyElement key={index} element={element} />
      ))}
      {grid && <GridLines {...{ grid, width, height }} />}
    </SvgPage>
  );
}

function DocumentSvg({
  dimensions,
  document,
  grid,
}: {
  dimensions: { width: number; height: number };
  document: Document;
  grid?: GridDimensions;
}) {
  const [zoom, setZoom] = useState(0.8);
  const [panOffset, setPanOffset] = useState({ x: -30, y: -30 });
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);

  const { width, height, pages } = document;

  // Temporary optimization: memoize the pages so that we don't rerender them
  // when changing pan/zoom
  const pagesElements = useMemo(
    () =>
      pages.map((page, index) => (
        <PageObject
          key={index}
          x={index % 2 === 0 ? 0 : width + PAGE_GAP}
          y={Math.floor(index / 2) * (height + PAGE_GAP)}
          width={width}
          height={height}
          page={page}
          grid={grid}
        />
      )),
    [width, height, pages, grid]
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
  flex-direction: column;
  min-width: 15rem;
  background: ${({ theme }) => theme.colors.foreground};
  color: ${({ theme }) => theme.colors.background};
  height: 100%;
  padding: 1rem;
  gap: 1rem;
  justify-items: stretch;

  /* Override link color for inverted background */
  section a {
    color: ${({ theme }) => theme.colors.background};
  }
`;

const ErrorMessage = styled.div`
  color: red;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
`;

export const paperSizeLabels: Record<BallotPaperSize, string> = {
  [BallotPaperSize.Letter]: '8.5 x 11 inches (Letter)',
  [BallotPaperSize.Legal]: '8.5 x 14 inches (Legal)',
  [BallotPaperSize.Custom17]: '8.5 x 17 inches',
  [BallotPaperSize.Custom18]: '8.5 x 18 inches',
  [BallotPaperSize.Custom21]: '8.5 x 21 inches',
  [BallotPaperSize.Custom22]: '8.5 x 22 inches',
};

export function BallotViewer({
  election,
  precinct,
  ballotStyle,
  layoutOptions,
}: {
  election: Election;
  precinct: Precinct;
  ballotStyle: BallotStyle;
  layoutOptions: LayoutOptions;
}): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const ballotRoutes = routes.election(electionId).ballots;
  const exportBallotMutation = exportBallot.useMutation();
  const [showGridLines, setShowGridLines] = useState(false);

  const { paperSize } = election.ballotLayout;
  const grid = gridForPaper(paperSize);

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const measureRef = useCallback((node: HTMLDivElement) => {
    if (node !== null) {
      setDimensions(node.getBoundingClientRect());
    }
  }, []);

  const ballotResult = layOutBallot({
    election,
    precinct,
    ballotStyle,
    isTestMode: true,
    layoutOptions,
  });

  if (ballotResult.isErr()) {
    // eslint-disable-next-line no-console
    console.log(ballotResult.err());
    return (
      <ErrorMessage>
        Error: {ballotResult.err().message ?? 'Something went wrong'}
      </ErrorMessage>
    );
  }

  function onExportPress() {
    exportBallotMutation.mutate(
      {
        electionId,
        precinctId: precinct.id,
        ballotStyleId: ballotStyle.id,
      },
      {
        onSuccess: (pdfContents) => {
          fileDownload(
            pdfContents,
            `ballot-${precinct.name.replace(' ', '_')}-${ballotStyle.id}.pdf`
          );
        },
      }
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <Controls>
        <section>
          <Breadcrumbs
            routes={[
              ballotRoutes.root,
              ballotRoutes.viewBallot(ballotStyle.id, precinct.id),
            ]}
          />
          <H1>View Ballot</H1>
          <H3>Ballot Style</H3>
          <P>{ballotStyle.id}</P>
          <H3>Precinct</H3>
          <P>{precinct.name}</P>
          <H3>Page Size</H3>
          <P>{paperSizeLabels[paperSize]}</P>
          <H3>Timing Marks</H3>
          <P>
            {grid.columns} columns x {grid.rows} rows
          </P>
          <P>
            <Button onPress={() => setShowGridLines(!showGridLines)} fullWidth>
              {showGridLines ? 'Hide Grid' : 'Show Grid'}
            </Button>
          </P>
        </section>
        <div style={{ flexGrow: 1 }} />
        <section>
          <H3>Export</H3>
          <P>
            <Button
              fullWidth
              onPress={onExportPress}
              disabled={exportBallotMutation.isLoading}
            >
              Export PDF
            </Button>
          </P>
        </section>
      </Controls>
      <div ref={measureRef} style={{ width: '100%', height: '100%' }}>
        {dimensions && (
          <DocumentSvg
            dimensions={dimensions}
            document={ballotResult.ok().document}
            grid={showGridLines ? grid : undefined}
          />
        )}
      </div>
    </div>
  );
}
