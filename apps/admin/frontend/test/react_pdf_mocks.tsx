import { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect } from 'react';

const mockPdf: { numPages: number } = {
  numPages: 1,
};

export function setMockPdfNumPages(numPages: number): void {
  mockPdf.numPages = numPages;
}

export function MockDocument({
  children,
  onLoadSuccess,
  file,
}: {
  children: React.ReactNode;
  onLoadSuccess: (pdf: PDFDocumentProxy) => void;
  file: string;
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
      <p>File: {file}</p>
      {children}
    </div>
  );
}

export function MockPage({ pageNumber }: { pageNumber: number }): JSX.Element {
  return <div>Page {pageNumber}</div>;
}
