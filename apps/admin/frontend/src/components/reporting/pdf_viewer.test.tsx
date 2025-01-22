import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { render, screen } from '../../../test/react_testing_library';
import { PdfViewer } from './pdf_viewer';
import { setMockPdfNumPages } from '../../../test/react_pdf_mocks';

const LOADING_TEST_ID = 'pdf-loading';

test('is blank when there is no pdf data', () => {
  render(<PdfViewer />);
  expect(screen.queryByTestId(LOADING_TEST_ID)).not.toBeInTheDocument();
  expect(screen.queryByText(/Page:/)).not.toBeInTheDocument();
});

test('shows loading message when loading=true', () => {
  render(<PdfViewer loading />);

  screen.getByTestId(LOADING_TEST_ID);
});

test('shows loading message when document numPages is not yet known', () => {
  setMockPdfNumPages(undefined);
  render(<PdfViewer pdfData={Buffer.from('mock-pdf')} />);

  screen.getByTestId(LOADING_TEST_ID);
});

test('rendering a document', async () => {
  setMockPdfNumPages(3);
  render(<PdfViewer pdfData={Buffer.from('mock-pdf')} />);

  await screen.findByText('Document');
  screen.getByText('mock-pdf');
  screen.getByText('Page 1');
  screen.getByText('Page 2');
  screen.getByText('Page 3');

  screen.getByText('Page: 1/3');

  // scroll tested in integration tests
});

test('when changing the document, the page count resets', async () => {
  const { rerender } = render(<PdfViewer pdfData={Buffer.from('mock-pdf')} />);
  await screen.findByText('Page: 1/1');

  rerender(<PdfViewer pdfData={undefined} />);
  await vi.waitFor(() => {
    expect(screen.queryByText(/Page:/)).not.toBeInTheDocument();
  });
});

test('when the PDF is too long, disables', async () => {
  setMockPdfNumPages(51);
  render(<PdfViewer pdfData={Buffer.from('mock-pdf')} />);
  await screen.findByRole('heading', { name: 'Preview Disabled' });
});
