import userEvent from '@testing-library/user-event';
import { Buffer } from 'buffer';
import { render, screen } from '../../../test/react_testing_library';
import { PdfViewer } from './pdf_viewer';
import { setMockPdfNumPages } from '../../../test/react_pdf_mocks';

test('shows loading message while the backend has not provided a path', () => {
  render(<PdfViewer />);

  screen.getByText('Generating Report');
});

test('pagination', async () => {
  window.location.protocol = 'http:';
  window.location.host = 'localhost';
  setMockPdfNumPages(3);
  render(<PdfViewer pdf={Buffer.from('fake-pdf')} />);

  await screen.findByText('Document');
  screen.getByText('File: http://localhost/preview/tmp.pdf');

  screen.getByText('Page 1');
  screen.getByText('1 of 3');
  const [pageBackButton, pageForwardButton] = screen.getAllByRole('button');
  expect(pageBackButton).toBeDisabled();

  userEvent.click(pageForwardButton);
  screen.getByText('Page 2');
  screen.getByText('2 of 3');
  expect(pageBackButton).not.toBeDisabled();

  userEvent.click(pageForwardButton);
  screen.getByText('Page 3');
  screen.getByText('3 of 3');
  expect(pageForwardButton).toBeDisabled();

  userEvent.click(pageBackButton);
  screen.getByText('Page 2');
  screen.getByText('2 of 3');
  expect(pageForwardButton).not.toBeDisabled();

  userEvent.click(pageBackButton);
  screen.getByText('Page 1');
  screen.getByText('1 of 3');
  expect(pageBackButton).toBeDisabled();
  expect(pageForwardButton).not.toBeDisabled();
});

test('no pagination controls when there is only one page', async () => {
  setMockPdfNumPages(1);
  render(<PdfViewer pdf={Buffer.from('fake-pdf')} />);

  await screen.findByText('Document');
  expect(screen.queryByRole('button')).toBeNull();
});
