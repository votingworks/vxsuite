import { Document, Page, pdfjs } from 'react-pdf';
import styled from 'styled-components';
import React, { useMemo, useState } from 'react';
import { Button, FullScreenIconWrapper, Icons } from '@votingworks/ui';
import { Buffer } from 'buffer';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs-dist/pdf.worker.js';

const PREVIEW_PX_PER_INCH = 166;
const PREVIEW_HEIGHT_PX = PREVIEW_PX_PER_INCH * 11;
const PREVIEW_WIDTH_PX = PREVIEW_PX_PER_INCH * 8.5;

const PageContainer = styled.div`
  margin-top: 1rem;

  page-custom {
    background: white;
    box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
    min-height: ${PREVIEW_HEIGHT_PX}px;
    min-width: ${PREVIEW_WIDTH_PX}px;
  }
`;

const PageNumberControl = styled.div`
  position: fixed;
  right: 0.5rem;
  bottom: 0.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background: white;
  box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: stretch;

  .page-control-button {
    width: 2rem;
    padding: 0;

    :disabled {
      border: none;
    }
  }
`;

const PageCount = styled.div`
  display: flex;
  align-items: center;
  line-height: 1.5rem;
  margin: 0 0.5rem;
`;

export interface PdfViewerProps {
  pdf?: Buffer;
  disabled?: boolean;
}

export function PdfViewer({
  pdf,
  disabled,
}: PdfViewerProps): JSX.Element | null {
  const [numPages, setNumPages] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);

  const file = useMemo(() => ({ data: pdf }), [pdf]);

  const loading = (
    <FullScreenIconWrapper>
      <Icons.Loading />
    </FullScreenIconWrapper>
  );

  function canPageBack() {
    return pageNumber > 1;
  }

  function pageBack() {
    if (canPageBack()) {
      setPageNumber(pageNumber - 1);
    }
  }

  function canPageForward() {
    return pageNumber < numPages;
  }

  function pageForward() {
    if (pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    }
  }

  if (disabled) {
    return null;
  }

  if (!pdf) {
    return loading;
  }

  return (
    <React.Fragment>
      <Document
        file={file}
        loading={loading}
        onLoadSuccess={(page) => setNumPages(page.numPages)}
      >
        <PageContainer>
          <Page
            pageNumber={pageNumber}
            height={PREVIEW_HEIGHT_PX}
            renderMode="svg"
            className="page-custom"
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={loading}
          />
        </PageContainer>
      </Document>
      {numPages > 1 && (
        <PageNumberControl>
          <Button
            icon="ChevronLeft"
            onPress={pageBack}
            disabled={!canPageBack()}
            fill="transparent"
            color={!canPageBack() ? 'inverseNeutral' : undefined}
            className="page-control-button"
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          />
          <PageCount>
            {pageNumber} of {numPages}
          </PageCount>
          <Button
            icon="ChevronRight"
            onPress={pageForward}
            disabled={!canPageForward()}
            fill="transparent"
            color={!canPageForward() ? 'inverseNeutral' : undefined}
            className="page-control-button"
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          />
        </PageNumberControl>
      )}
    </React.Fragment>
  );
}
