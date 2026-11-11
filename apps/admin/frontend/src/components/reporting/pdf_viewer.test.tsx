import { expect, test, vi } from 'vitest';
import { render, screen } from '../../../test/react_testing_library.js';
import { PdfViewer } from './pdf_viewer.js';
import { mockPdfPreview } from '../../../test/helpers/pdf_preview.js';

const LOADING_TEST_ID = 'pdf-loading';

test('is blank when there is no preview', () => {
  render(<PdfViewer />);
  expect(screen.queryByTestId(LOADING_TEST_ID)).not.toBeInTheDocument();
  expect(screen.queryByText(/Page:/)).not.toBeInTheDocument();
});

test('shows loading message when loading=true', () => {
  render(<PdfViewer loading />);

  screen.getByTestId(LOADING_TEST_ID);
});

test('rendering a preview', () => {
  render(<PdfViewer pdfPreview={mockPdfPreview('mock-pdf', 3)} />);

  const pages = screen.getAllByRole('img');
  expect(pages.map((page) => page.getAttribute('alt'))).toEqual([
    'Page 1',
    'Page 2',
    'Page 3',
  ]);
  expect(pages[0]).toHaveStyle({ width: '1468.8px', height: '1900.8px' });
  screen.getByText('Page: 1/3');

  // scroll tested in integration tests
});

test('when changing the preview, the page count resets', async () => {
  const { rerender } = render(
    <PdfViewer pdfPreview={mockPdfPreview('mock-pdf')} />
  );
  await screen.findByText('Page: 1/1');

  rerender(<PdfViewer pdfPreview={undefined} />);
  await vi.waitFor(() => {
    expect(screen.queryByText(/Page:/)).not.toBeInTheDocument();
  });
});

test('when the report is too long, disables', () => {
  render(
    <PdfViewer pdfPreview={{ ...mockPdfPreview('mock-pdf'), pageCount: 51 }} />
  );
  screen.getByRole('heading', { name: 'Preview Disabled' });
});
