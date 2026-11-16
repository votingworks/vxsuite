import { Link } from 'react-router-dom';
import { find, range, throwIllegalValue } from '@votingworks/basics';
import {
  type BallotMode,
  type BallotStyleId,
  BallotType,
  type Contest,
  type ElectionId,
  type PrecinctId,
} from '@votingworks/types';
import { useMemo, useState, type ReactNode, type UIEvent } from 'react';
import styled from 'styled-components';
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
import type {
  BallotPreviewPdf,
  BallotTemplateId,
  NhStateBallotVariant,
} from '@votingworks/hmpb';
import type { BallotPreviewInput } from './api.js';
import { paperSizeLabels } from './ballot_layout_form.js';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { FieldName as BaseFieldName, Row } from './layout.js';

// The worker is bundled from the same pdfjs-dist version react-pdf uses
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

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
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function PdfViewer({ pdfData }: { pdfData?: Uint8Array }) {
  const [numPages, setNumPages] = useState<number>();
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const file = useMemo(
    // Copy the buffer since react-pdf drains it, which can cause an error on
    // re-render
    () => pdfData && { data: Uint8Array.from(pdfData) },
    [pdfData]
  );

  // @coverage-defer
  function onScroll(e: UIEvent<HTMLDivElement>) {
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

function formContestTooLongErrorMessage(
  contest: Contest,
  ballotTemplateId: BallotTemplateId
): string {
  const issue = `Contest "${contest.title}" was too long to fit on the page.`;
  let suggestion = 'Try a longer paper size or higher density.';
  // Only the NH template supports flowing ballot measure content onto another page
  if (contest.type === 'yesno' && ballotTemplateId === 'NhBallot') {
    suggestion =
      'Try a longer paper size, higher density, or adding a line break to the contest description.';
  }
  // The MI template doesn't support density settings
  if (ballotTemplateId === 'MiBallot') {
    suggestion = 'Try a longer paper size.';
  }
  return `${issue} ${suggestion}`;
}

function ErrorMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Row
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        padding: '5rem',
      }}
    >
      <Callout color="danger" icon="Danger">
        {children}
      </Callout>
    </Row>
  );
}

export interface BallotViewerProps {
  electionId: ElectionId;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotTemplateId: BallotTemplateId;
  closePath: string;
  electionInfoPath: string;
  renderActions: (props: {
    previewInput: BallotPreviewInput;
    preview?: BallotPreviewPdf;
  }) => ReactNode;
}

export function BallotViewer({
  electionId,
  ballotStyleId,
  precinctId,
  ballotTemplateId,
  closePath,
  electionInfoPath,
  renderActions,
}: BallotViewerProps): JSX.Element | null {
  const api = useElectionDefinitionApi();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listPrecinctsQuery = api.listPrecincts.useQuery(electionId);
  const listBallotStylesQuery = api.listBallotStyles.useQuery(electionId);
  const listPartiesQuery = api.listParties.useQuery(electionId);
  const getBallotLayoutSettingsQuery =
    api.getBallotLayoutSettings.useQuery(electionId);
  const [ballotType, setBallotType] = useState<BallotType>(BallotType.Precinct);
  const [ballotMode, setBallotMode] = useState<BallotMode>('official');
  const [variant, setVariant] = useState<NhStateBallotVariant>();
  const previewInput: BallotPreviewInput = {
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    ballotMode,
    variant,
  };
  const getBallotPreviewPdfQuery =
    api.getBallotPreviewPdf.useQuery(previewInput);
  const ballotPreview = getBallotPreviewPdfQuery.data?.ok();

  if (
    !(
      getElectionInfoQuery.isSuccess &&
      listPrecinctsQuery.isSuccess &&
      listBallotStylesQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotLayoutSettingsQuery.isSuccess
    )
  ) {
    return null; // Initial loading state
  }

  const electionInfo = getElectionInfoQuery.data;
  const precincts = listPrecinctsQuery.data;
  const ballotStyles = listBallotStylesQuery.data;
  const parties = listPartiesQuery.data;
  const { paperSize } = getBallotLayoutSettingsQuery.data;
  const enableFederalOfficeOnly = ballotTemplateId === 'NhStateBallot';
  const precinct = find(precincts, (p) => p.id === precinctId);
  const ballotStyle = find(ballotStyles, (bs) => bs.id === ballotStyleId);

  return (
    <TaskScreen>
      <TaskContent style={{ display: 'flex' }}>
        <Viewer>
          {(() => {
            if (!getBallotPreviewPdfQuery.isSuccess) {
              return <PdfViewer />;
            }

            const ballotResult = getBallotPreviewPdfQuery.data;

            if (ballotResult.isErr()) {
              const err = ballotResult.err();
              switch (err.error) {
                case 'missingSignature':
                  return (
                    <ErrorMessage>
                      <span>
                        Missing signature. Upload a signature in{' '}
                        <Link to={electionInfoPath}>Election Info</Link>.
                      </span>
                    </ErrorMessage>
                  );
                case 'contestTooLong':
                  return (
                    <ErrorMessage>
                      <span>
                        {formContestTooLongErrorMessage(
                          err.contest,
                          ballotTemplateId
                        )}
                      </span>
                    </ErrorMessage>
                  );
                default: {
                  throwIllegalValue(err, 'error');
                }
              }
            }

            return <PdfViewer pdfData={ballotResult.ok().pdfData} />;
          })()}
        </Viewer>
      </TaskContent>
      <TaskControls style={{ width: '20rem' }}>
        <TaskHeader>
          <H1>View Ballot</H1>
          <LinkButton
            to={closePath}
            icon="X"
            color="inverseNeutral"
            fill="transparent"
            aria-label="Close"
            style={{ fontSize: '1.5rem' }}
          />
        </TaskHeader>

        <Controls>
          <div>
            <FieldName>Ballot Style</FieldName>
            {ballotStyle.id}
          </div>

          <div>
            <FieldName>Precinct</FieldName>
            {precinct.name}
          </div>

          {electionInfo.type === 'primary' &&
            // @coverage-defer
            !electionInfo.isMiCombinedBallotPrimary && (
              // @coverage-defer
              <div>
                <FieldName>Party</FieldName>
                {/* @coverage-defer */}
                {find(parties, (p) => p.id === ballotStyle.partyId).fullName}
              </div>
            )}

          <div>
            <FieldName>Page Size</FieldName>
            {paperSizeLabels[paperSize]}{' '}
          </div>

          {enableFederalOfficeOnly ? (
            <RadioGroup
              label="Ballot Type"
              options={[
                { value: BallotType.Precinct, label: 'Precinct' },
                { value: BallotType.Absentee, label: 'Absentee' },
                {
                  value: 'federal-office-only',
                  label: 'Federal Office Only',
                },
              ]}
              value={
                variant === 'federalOfficeOnly'
                  ? 'federal-office-only'
                  : ballotType
              }
              onChange={(value) => {
                // @coverage-defer
                if (value === 'federal-office-only') {
                  setVariant('federalOfficeOnly');
                  setBallotType(BallotType.Absentee);
                  setBallotMode('official');
                } else {
                  setBallotType(value);
                  setVariant(undefined);
                }
              }}
              inverse
            />
          ) : (
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
          )}

          <RadioGroup
            label="Tabulation Mode"
            options={[
              { value: 'official', label: 'Official Ballot' },
              { value: 'test', label: 'L&A Test Ballot' },
              { value: 'sample', label: 'Sample Ballot' },
            ]}
            value={ballotMode}
            onChange={setBallotMode}
            disabled={variant !== undefined}
            inverse
          />

          <ActionButtons>
            {renderActions({ previewInput, preview: ballotPreview })}
          </ActionButtons>
        </Controls>
      </TaskControls>
    </TaskScreen>
  );
}
