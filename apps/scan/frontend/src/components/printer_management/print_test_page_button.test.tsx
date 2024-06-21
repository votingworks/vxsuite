import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { render, screen, waitFor } from '../../../test/react_testing_library';
import { PrintTestPageButton } from './print_test_page_button';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderButton() {
  return render(provideApi(apiMock, <PrintTestPageButton />));
}

test('good path - successful print', async () => {
  apiMock.setPrinterStatusV4();
  renderButton();

  const testPrint = apiMock.expectPrintTestPage();
  userEvent.click(await screen.findButton('Print Test Page'));

  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Test Page Printed');

  userEvent.click(screen.getButton('Close'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('bad path - misaligned print', async () => {
  apiMock.setPrinterStatusV4();
  renderButton();

  const testPrint = apiMock.expectPrintTestPage(err({ state: 'no-paper' }));
  userEvent.click(await screen.findButton('Print Test Page'));

  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Print Failed');
});

test('ugly path - printer error', async () => {
  apiMock.setPrinterStatusV4();
  renderButton();

  const testPrint = apiMock.expectPrintTestPage(
    err({ state: 'error', type: 'disconnected' })
  );
  userEvent.click(await screen.findButton('Print Test Page'));

  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Printer Error');
});

test('button disabled if printer not idle', async () => {
  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  renderButton();

  expect(await screen.findButton('Print Test Page')).toBeDisabled();
});
