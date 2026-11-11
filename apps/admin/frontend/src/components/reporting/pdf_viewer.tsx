import styled from 'styled-components';
import { useMemo, useState, type UIEvent } from 'react';
import { H3, Icons, P } from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import type { PdfPreview } from '@votingworks/admin-backend';

const CSS_PIXELS_PER_POINT = 96 / 72;

const PdfContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${(p) => p.theme.colors.container};
  max-height: 100%;
`;

const PdfDocumentScroller = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 1rem 0;
  width: 100%;
`;

const PageImage = styled.img`
  display: block;
  box-shadow: 0 0 0.5rem rgb(0, 0, 0, 25%);
  margin: 0 auto;

  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;

const PdfControls = styled.div`
  position: sticky;
  left: 0;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 0.4rem 1rem;
  min-height: 1.6rem;
  background-color: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  display: flex;
  align-items: center;
  font-size: 0.8rem;
`;

export const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const DEFAULT_ZOOM = 1.8;

interface PdfViewerProps {
  pdfPreview?: PdfPreview;
  loading?: boolean;
}

function PdfViewerHelper({ pdfPreview, loading }: PdfViewerProps): JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(
    () =>
      pdfPreview?.pages.map(({ png, width, height }) => ({
        src: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
        width: width * DEFAULT_ZOOM * CSS_PIXELS_PER_POINT,
        height: height * DEFAULT_ZOOM * CSS_PIXELS_PER_POINT,
      })),
    [pdfPreview]
  );
  const numPages = pages?.length;

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

  if (pdfPreview && pdfPreview.pages.length < pdfPreview.pageCount) {
    return (
      <PdfContainer>
        <PdfControls />
        <div style={{ margin: 'auto', padding: '1rem' }}>
          <H3>Preview Disabled</H3>
          <P>
            This report is too large to preview.
            <br />
            Print or export the report instead.
          </P>
        </div>
      </PdfContainer>
    );
  }

  return (
    <PdfContainer>
      <PdfControls>
        <span>{numPages ? `Page: ${currentPage}/${numPages}` : ''}</span>
      </PdfControls>
      {pages ? (
        <PdfDocumentScroller onScroll={onScroll} data-testid="pdf-scroller">
          {pages.map(({ src, width, height }, index) => (
            <PageImage
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              src={src}
              alt={`Page ${index + 1}`}
              style={{ width, height }}
            />
          ))}
        </PdfDocumentScroller>
      ) : loading ? (
        <Row
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '3rem',
            height: '100%',
            minHeight: '5rem',
          }}
          data-testid="pdf-loading"
        >
          <Icons.Loading />
        </Row>
      ) : null}
    </PdfContainer>
  );
}

export function PdfViewer({
  loading,
  pdfPreview,
}: PdfViewerProps): JSX.Element {
  return (
    <PdfViewerHelper
      // Reset the current page whenever we change the preview
      key={String(Boolean(pdfPreview))}
      loading={loading}
      pdfPreview={pdfPreview}
    />
  );
}
