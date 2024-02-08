import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect } from 'react';
import { Buffer } from 'buffer';
import styled from 'styled-components';

const mockPdf: { numPages: number } = {
  numPages: 1,
};

export function setMockPdfNumPages(numPages: number): void {
  mockPdf.numPages = numPages;
}

const Page = styled.div`
  height: 1100px;
  width: 850px;
`;

export function MockDocument({
  children,
  onLoadSuccess,
  file,
}: {
  children: React.ReactNode;
  onLoadSuccess: (pdf: PDFDocumentProxy) => void;
  file: { data?: Buffer };
}): JSX.Element {
  useEffect(() => {
    onLoadSuccess({
      numPages: mockPdf.numPages,
    } as unknown as PDFDocumentProxy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1>Document</h1>
      <p>{file.data?.toString()}</p>
      {children}
    </div>
  );
}

export function MockPage({ pageNumber }: { pageNumber: number }): JSX.Element {
  return <Page>Page {pageNumber}</Page>;
}
