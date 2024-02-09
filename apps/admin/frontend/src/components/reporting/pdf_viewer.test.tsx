import { Buffer } from 'buffer';
import { render, screen } from '../../../test/react_testing_library';
import { PdfViewer } from './pdf_viewer';
import { setMockPdfNumPages } from '../../../test/react_pdf_mocks';

const LOADING_TEST_ID = 'pdf-loading';
test('shows loading message when there is no pdf data', () => {
  render(<PdfViewer />);

  screen.getByTestId(LOADING_TEST_ID);
});

test('does not show loading message when viewer is disabled, even is there is data', () => {
  render(<PdfViewer pdfData={Buffer.from('mock-pdf')} disabled />);

  expect(screen.queryByTestId(LOADING_TEST_ID)).not.toBeInTheDocument();
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
