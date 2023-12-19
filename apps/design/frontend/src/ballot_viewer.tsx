/* eslint-disable react/no-array-index-key */
import { useRef, useState, useMemo, useCallback } from 'react';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  BallotPaperSize,
  BallotStyle,
  BallotType,
  Election,
  getPartyForBallotStyle,
  GridLayout,
  GridPositionWriteIn,
  Precinct,
} from '@votingworks/types';
import styled from 'styled-components';
import { Breadcrumbs, Button, H1, H3, RadioGroup } from '@votingworks/ui';
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
  BallotMode,
} from '@votingworks/hmpb-layout';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { exportBallot } from './api';
import { ElectionIdParams, routes } from './routes';
import { Column, FieldName as BaseFieldName, Row } from './layout';

const FieldName = styled(BaseFieldName)`
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
`;

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

interface DebugFlags {
  showGridLines: boolean;
  showWriteInOptionBoxes: boolean;
}

interface DebugInfo {
  gridLayout: GridLayout;
  grid: GridDimensions;
  pageNumber: number;
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

function WriteInOptionBoxes({
  gridLayout,
  grid,
  pageNumber,
  width,
  height,
}: DebugInfo & { width: number; height: number }) {
  const { optionBoundsFromTargetMark, gridPositions } = gridLayout;
  const xScale = width / (grid.columns + 1);
  const yScale = height / (grid.rows + 1);
  const sheetNumber = Math.floor((pageNumber + 1) / 2);
  const side = pageNumber % 2 === 1 ? 'front' : 'back';
  const pageMarginGridUnits = 1;
  return (
    <g>
      {gridPositions
        .filter(
          (gridPosition): gridPosition is GridPositionWriteIn =>
            gridPosition.sheetNumber === sheetNumber &&
            gridPosition.side === side &&
            gridPosition.type === 'write-in'
        )
        .map((gridPosition) => {
          return (
            <rect
              key={gridPosition.contestId + gridPosition.writeInIndex}
              x={
                (gridPosition.column -
                  optionBoundsFromTargetMark.left +
                  pageMarginGridUnits) *
                xScale
              }
              y={
                (gridPosition.row -
                  optionBoundsFromTargetMark.top +
                  pageMarginGridUnits) *
                yScale
              }
              width={
                (optionBoundsFromTargetMark.right +
                  optionBoundsFromTargetMark.left) *
                xScale
              }
              height={
                (optionBoundsFromTargetMark.bottom +
                  optionBoundsFromTargetMark.top) *
                yScale
              }
              fill="none"
              stroke="blue"
              strokeWidth={0.5}
            />
          );
        })}
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
  debugInfo,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  page: Page;
  debugInfo: DebugInfo & DebugFlags;
}) {
  return (
    <SvgPage {...{ x, y, width, height, ...page }}>
      {page.children.map((element, index) => (
        <SvgAnyElement key={index} element={element} />
      ))}
      {debugInfo.showGridLines && (
        <GridLines {...{ ...debugInfo, width, height }} />
      )}
      {debugInfo.showWriteInOptionBoxes && (
        <WriteInOptionBoxes {...{ ...debugInfo, width, height }} />
      )}
    </SvgPage>
  );
}

function DocumentSvg({
  dimensions,
  document,
  debugInfo,
}: {
  dimensions: { width: number; height: number };
  document: Document;
  debugInfo: Omit<DebugInfo, 'pageNumber'> & DebugFlags;
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
          debugInfo={{ ...debugInfo, pageNumber: index + 1 }}
        />
      )),
    [width, height, pages, debugInfo]
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
  background: ${({ theme }) => theme.colors.inverseBackground};
  color: ${({ theme }) => theme.colors.onInverse};
  height: 100%;
  padding: 1rem;
  gap: 1rem;
  justify-items: stretch;
  overflow-y: auto;

  a {
    color: ${({ theme }) => theme.colors.inversePrimary};
  }
`;

const Canvas = styled.div`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.container};
`;

const DebugPanelWrapper = styled.div`
  position: absolute;
  bottom: 0.5rem;
  right: 0.75rem;

  button {
    padding: 0.25rem 0.5rem;
  }
`;

const DebugPanel = styled.div`
  background: ${({ theme }) => theme.colors.containerLow};
  color: ${({ theme }) => theme.colors.onBackgroundMuted};
  border: 1px solid ${({ theme }) => theme.colors.outline};
  padding: 0.5rem;
  border-radius: 0.25rem;
  gap: 0.5rem;
`;

function DebugPanelToggleButton({
  debugFlags,
  setDebugFlags,
  showDebugPanel,
  setShowDebugPanel,
}: {
  debugFlags: DebugFlags;
  setDebugFlags: (debugFlags: DebugFlags) => void;
  showDebugPanel: boolean;
  setShowDebugPanel: (showDebugPanel: boolean) => void;
}) {
  return (
    <DebugPanelWrapper>
      {showDebugPanel ? (
        <DebugPanel>
          <Row
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <FieldName>Debug</FieldName>
            <Button
              fill="transparent"
              onPress={() => setShowDebugPanel(false)}
              icon="X"
            />
          </Row>
          <Column style={{ gap: '0.5rem' }}>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={debugFlags.showGridLines}
                onChange={() => {
                  setDebugFlags({
                    ...debugFlags,
                    showGridLines: !debugFlags.showGridLines,
                  });
                }}
              />{' '}
              Show grid lines
            </label>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={debugFlags.showWriteInOptionBoxes}
                onChange={() =>
                  setDebugFlags({
                    ...debugFlags,
                    showWriteInOptionBoxes: !debugFlags.showWriteInOptionBoxes,
                  })
                }
              />{' '}
              Show write-in crop boxes
            </label>
          </Column>
        </DebugPanel>
      ) : (
        <Button onPress={() => setShowDebugPanel(true)} fill="transparent">
          Debug
        </Button>
      )}
    </DebugPanelWrapper>
  );
}

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
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugFlags, setDebugFlags] = useState<DebugFlags>({
    showGridLines: false,
    showWriteInOptionBoxes: false,
  });
  const [ballotType, setBallotType] = useState<BallotType>(BallotType.Precinct);
  const [ballotMode, setBallotMode] = useState<BallotMode>('official');

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
    ballotType,
    ballotMode,
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
        ballotType,
        ballotMode,
      },
      {
        onSuccess: (pdfContents) => {
          fileDownload(
            pdfContents,
            `${ballotMode}-${ballotType}-ballot-${precinct.name.replace(
              ' ',
              '_'
            )}-${ballotStyle.id}.pdf`
          );
        },
      }
    );
  }

  const { title } = ballotRoutes.viewBallot(ballotStyle.id, precinct.id);

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <Controls>
        <section>
          <Breadcrumbs
            currentTitle={title}
            parentRoutes={[ballotRoutes.root]}
          />
          <H1 style={{ marginTop: 0 }}>{title}</H1>
          <Column style={{ gap: '1rem' }}>
            <div>
              <FieldName>Ballot Style</FieldName>
              {ballotStyle.id}
            </div>

            <div>
              <FieldName>Precinct</FieldName>
              {precinct.name}
            </div>

            {election.type === 'primary' && (
              <div>
                <FieldName>Party</FieldName>
                {
                  assertDefined(
                    getPartyForBallotStyle({
                      election,
                      ballotStyleId: ballotStyle.id,
                    })
                  ).fullName
                }
              </div>
            )}

            <div>
              <FieldName>Page Size</FieldName>
              {paperSizeLabels[paperSize]}{' '}
            </div>

            <RadioGroup
              label="Ballot Type"
              options={[
                { value: BallotType.Precinct, label: 'Precinct' },
                { value: BallotType.Absentee, label: 'Absentee' },
              ]}
              value={ballotType}
              onChange={setBallotType}
              inverse
            />

            <RadioGroup
              label="Tabulation Mode"
              options={[
                { value: 'official', label: 'Official Ballot' },
                { value: 'test', label: 'L&A Test Ballot' },
                { value: 'sample', label: 'Sample Ballot' },
              ]}
              value={ballotMode}
              onChange={setBallotMode}
              inverse
            />

            <div>
              <FieldName>Timing Mark Grid</FieldName>
              <div>
                {grid.columns} columns x {grid.rows} rows
              </div>
            </div>
          </Column>
        </section>
        <section style={{ marginTop: 'auto' }}>
          <H3>Export</H3>
          <Button
            color="inverseNeutral"
            onPress={onExportPress}
            disabled={exportBallotMutation.isLoading}
          >
            Export PDF
          </Button>
        </section>
      </Controls>
      <Canvas ref={measureRef}>
        {dimensions && (
          <DocumentSvg
            dimensions={dimensions}
            document={ballotResult.ok().document}
            debugInfo={{
              ...debugFlags,
              gridLayout: ballotResult.ok().gridLayout,
              grid,
            }}
          />
        )}
        <DebugPanelToggleButton
          debugFlags={debugFlags}
          setDebugFlags={setDebugFlags}
          showDebugPanel={showDebugPanel}
          setShowDebugPanel={setShowDebugPanel}
        />
      </Canvas>
    </div>
  );
}
