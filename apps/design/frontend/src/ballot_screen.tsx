import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { assert, find, range } from '@votingworks/basics';
import {
  HmpbBallotPaperSize,
  BallotType,
  unsafeParse,
  ElectionIdSchema,
  BallotStyleIdSchema,
  PrecinctIdSchema,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import React, { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { z } from 'zod';
import {
  Button,
  Callout,
  H1,
  Icons,
  LinkButton,
  RadioGroup,
  TaskContent,
  TaskControls,
  TaskHeader,
  TaskScreen,
} from '@votingworks/ui';
import { Document, Page, pdfjs } from 'react-pdf';
import { format } from '@votingworks/utils';
import type { BallotMode } from '@votingworks/design-backend';
import {
  getBallotPreviewPdf,
  getElectionInfo,
  listPrecincts,
  getBallotPaperSize,
  listBallotStyles,
  listParties,
} from './api';
import { routes } from './routes';
import { Column, FieldName as BaseFieldName, Row } from './layout';

// Worker file must be copied from pdfjs-dist into public directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const FieldName = styled(BaseFieldName)`
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
`;

const Controls = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 18rem;
  background: ${({ theme }) => theme.colors.inverseBackground};
  color: ${({ theme }) => theme.colors.onInverse};
  height: 100%;
  padding: 0.5rem 1rem;
  gap: 1rem;
  justify-items: stretch;
`;

const Viewer = styled.div`
  flex: 1;
  background: ${({ theme }) => theme.colors.containerHigh};
  overflow: hidden;

  /* Make sure overflow can scroll horizontally */
  min-width: 0;
`;

const PdfContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const PdfDocumentScroller = styled.div`
  overflow: auto;
  flex: 1;
  padding: 2rem;

  /* stylelint-disable selector-class-pattern */
  .react-pdf__Document .react-pdf__Page {
    box-shadow: 0 0 0.5rem rgb(0, 0, 0, 25%);
    margin: 0 auto;
    width: min-content;

    &:not(:last-child) {
      margin-bottom: 1rem;
    }
  }
`;

const PdfControls = styled.div`
  position: sticky;
  left: 0;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 0.25rem 0.25rem 0.25rem 1rem;
  background-color: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ActionButtons = styled.div`
  margin-top: 1rem;

  & > * {
    width: 100%;
    margin-top: 0.5rem;
  }
`;

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function PdfViewer({ pdfData }: { pdfData?: Buffer }) {
  const [numPages, setNumPages] = useState<number>();
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const file = useMemo(
    // Copy the buffer since react-pdf drains it, which can cause an error on
    // re-render
    () => pdfData && { data: Buffer.from(pdfData) },
    [pdfData]
  );

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!numPages) return;
    const { scrollHeight, scrollTop } = e.currentTarget;
    // Add a fraction of the page height to the scroll position to make the
    // transition happen a little earlier (when most of the next page is
    // visible)
    const pageHeight = scrollHeight / numPages;
    const scrollProgress = (scrollTop + pageHeight / 6) / scrollHeight;
    setCurrentPage(Math.floor(scrollProgress * numPages) + 1);
  }

  const loading = (
    <Row
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '3rem',
        height: '100%',
      }}
    >
      <Icons.Loading />
    </Row>
  );

  return (
    <PdfContainer>
      <PdfControls>
        <div>
          {numPages && (
            <span>
              Page: {currentPage}/{numPages}
            </span>
          )}
        </div>
        <Row style={{ gap: '0.5rem', alignItems: 'center' }}>
          <Button
            aria-label="Zoom Out"
            icon="ZoomOut"
            color="inverseNeutral"
            fill="transparent"
            onPress={() => setZoom(Math.max(zoom - ZOOM_STEP, MIN_ZOOM))}
          />
          <span>{format.percent(zoom)}</span>
          <Button
            aria-label="Zoom In"
            icon="ZoomIn"
            color="inverseNeutral"
            fill="transparent"
            onPress={() => setZoom(Math.min(zoom + ZOOM_STEP, MAX_ZOOM))}
          />
        </Row>
      </PdfControls>
      {pdfData ? (
        <PdfDocumentScroller onScroll={onScroll}>
          {!numPages && loading}
          <Document
            file={file}
            onSourceSuccess={() => setNumPages(undefined)}
            onLoadSuccess={(result) => setNumPages(result.numPages)}
            // Hide the built in loading message
            loading=""
          >
            {numPages &&
              range(1, numPages + 1).map((pageNumber) => (
                <Page
                  key={pageNumber}
                  // ReactPDF renders at 3/4 of actual size for some reason
                  // https://github.com/wojtekmaj/react-pdf/issues/1219
                  scale={zoom * (4 / 3)}
                  pageNumber={pageNumber}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading=""
                />
              ))}
          </Document>
        </PdfDocumentScroller>
      ) : (
        loading
      )}
    </PdfContainer>
  );
}

export const paperSizeLabels: Record<HmpbBallotPaperSize, string> = {
  [HmpbBallotPaperSize.Letter]: '8.5 x 11 inches (Letter)',
  [HmpbBallotPaperSize.Legal]: '8.5 x 14 inches (Legal)',
  [HmpbBallotPaperSize.Custom17]: '8.5 x 17 inches',
  [HmpbBallotPaperSize.Custom18]: '8.5 x 18 inches',
  [HmpbBallotPaperSize.Custom21]: '8.5 x 21 inches',
  [HmpbBallotPaperSize.Custom22]: '8.5 x 22 inches',
};

export function BallotScreen(): JSX.Element | null {
  const params = useParams<{
    electionId: string;
    ballotStyleId: string;
    precinctId: string;
  }>();
  const { electionId, ballotStyleId, precinctId } = unsafeParse(
    z.object({
      electionId: ElectionIdSchema,
      ballotStyleId: BallotStyleIdSchema,
      precinctId: PrecinctIdSchema,
    }),
    params
  );

  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const listBallotStylesQuery = listBallotStyles.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotPaperSizeQuery = getBallotPaperSize.useQuery(electionId);
  const [ballotType, setBallotType] = useState<BallotType>(BallotType.Precinct);
  const [ballotMode, setBallotMode] = useState<BallotMode>('official');
  const printIframeRef = useRef<HTMLIFrameElement>(null);
  const getBallotPreviewPdfQuery = getBallotPreviewPdf.useQuery({
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    ballotMode,
  });
  const ballotPreview = getBallotPreviewPdfQuery.data?.ok();

  const pdfFile = useMemo(() => {
    if (!ballotPreview) return;
    const blob = new Blob([ballotPreview.pdfData], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }, [ballotPreview]);

  function onDownloadPdfPressed() {
    if (!ballotPreview) return;
    fileDownload(
      ballotPreview.pdfData,
      ballotPreview.fileName,
      'application/pdf'
    );
  }

  function onPrintPdfPressed() {
    printIframeRef.current?.contentWindow?.print();
  }

  if (
    !(
      getElectionInfoQuery.isSuccess &&
      listPrecinctsQuery.isSuccess &&
      listBallotStylesQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotPaperSizeQuery.isSuccess
    )
  ) {
    return null; // Initial loading state
  }

  const electionInfo = getElectionInfoQuery.data;
  const precincts = listPrecinctsQuery.data;
  const ballotStyles = listBallotStylesQuery.data;
  const parties = listPartiesQuery.data;
  const paperSize = getBallotPaperSizeQuery.data;
  const precinct = find(precincts, (p) => p.id === precinctId);
  const ballotStyle = find(ballotStyles, (bs) => bs.id === ballotStyleId);

  const ballotRoutes = routes.election(electionId).ballots;
  const { title } = ballotRoutes.viewBallot(ballotStyle.id, precinct.id);

  return (
    <TaskScreen>
      {pdfFile && (
        <iframe
          ref={printIframeRef}
          src={pdfFile}
          title="Print PDF"
          style={{ display: 'none' }}
        />
      )}
      <TaskContent style={{ display: 'flex' }}>
        <Viewer>
          {(() => {
            if (!getBallotPreviewPdfQuery.isSuccess) {
              return <PdfViewer />;
            }

            const ballotResult = getBallotPreviewPdfQuery.data;

            if (ballotResult.isErr()) {
              const err = ballotResult.err();
              assert(err.error === 'contestTooLong');
              return (
                <Row
                  style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Callout color="danger" icon="Danger">
                    <span>
                      Contest &quot;{err.contest.title}&quot; was too long to
                      fit on the page. Try a longer paper size.
                    </span>
                  </Callout>
                </Row>
              );
            }

            return <PdfViewer pdfData={ballotResult.ok().pdfData} />;
          })()}
        </Viewer>
      </TaskContent>
      <TaskControls style={{ width: '20rem' }}>
        <TaskHeader>
          <H1>{title}</H1>
          <LinkButton
            to={ballotRoutes.root.path}
            icon="X"
            color="inverseNeutral"
            fill="transparent"
            aria-label="Close"
            style={{ fontSize: '1.5rem' }}
          />
        </TaskHeader>

        <Controls>
          <Column style={{ gap: '1rem' }}>
            <div>
              <FieldName>Ballot Style</FieldName>
              {ballotStyle.id}
            </div>

            <div>
              <FieldName>Precinct</FieldName>
              {precinct.name}
            </div>

            {electionInfo.type === 'primary' && (
              <div>
                <FieldName>Party</FieldName>
                {find(parties, (p) => p.id === ballotStyle.partyId).fullName}
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

            <ActionButtons>
              <Button
                icon="Export"
                variant="inverseNeutral"
                onPress={onDownloadPdfPressed}
                disabled={!pdfFile}
              >
                Download PDF
              </Button>
              <Button
                icon="Print"
                variant="inverseNeutral"
                onPress={onPrintPdfPressed}
                disabled={!pdfFile}
              >
                Print
              </Button>
            </ActionButtons>
          </Column>
        </Controls>
      </TaskControls>
    </TaskScreen>
  );
}
