import { beforeEach, afterEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { render, screen, waitFor } from '../../../test/react_testing_library';
import {
  ElectionManagerLoadPaperButton,
  ElectionManagerLoadPaperButtonProps,
} from './election_manager_load_paper_button';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderButton(
  props: Partial<ElectionManagerLoadPaperButtonProps> = {}
) {
  return render(
    provideApi(
      apiMock,
      <ElectionManagerLoadPaperButton isPrimary={false} {...props} />
    )
  );
}

async function openModal() {
  const loadPaperButton = screen.getButton('Load Paper');
  await waitFor(() => {
    expect(loadPaperButton).toBeEnabled();
  });
  userEvent.click(loadPaperButton);
}

test('happy path', async () => {
  apiMock.setPrinterStatusV4();
  renderButton({ isPrimary: true });

  await openModal();

  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');

  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');

  apiMock.setPrinterStatusV4({ state: 'idle' });
  await screen.findByText('Paper Detected');

  const testPrint = apiMock.expectPrintTestPage();
  screen.getButton('Cancel'); // option to cancel is there
  userEvent.click(screen.getButton('Print Test Page'));

  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Test Page Printed');

  apiMock.expectLogTestPrintOutcome('pass');
  userEvent.click(screen.getButton('Pass'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('button disabled in case of printer error', async () => {
  apiMock.setPrinterStatusV4();
  renderButton();

  const loadPaperButton = screen.getButton('Load Paper');
  await waitFor(() => {
    expect(loadPaperButton).toBeEnabled();
  });

  apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
  await waitFor(() => {
    expect(loadPaperButton).toBeDisabled();
  });
});

test('error or user error during loading flow', async () => {
  apiMock.setPrinterStatusV4();
  renderButton();

  await openModal();

  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');

  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  await screen.findByText('No Paper Detected');

  apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
  await screen.findByText('Printer Error');
});

test('hardware error on test print', async () => {
  apiMock.setPrinterStatusV4();
  renderButton({ isPrimary: true });

  await openModal();
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');
  apiMock.setPrinterStatusV4({ state: 'idle' });
  await screen.findByText('Paper Detected');

  const testPrint = apiMock.expectPrintTestPage(
    err({
      state: 'error',
      type: 'disconnected',
    })
  );
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Printer Error');
});

test('out of paper on test print', async () => {
  apiMock.setPrinterStatusV4();
  renderButton({ isPrimary: true });

  await openModal();
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');
  apiMock.setPrinterStatusV4({ state: 'idle' });
  await screen.findByText('Paper Detected');

  const testPrint = apiMock.expectPrintTestPage(
    err({
      state: 'no-paper',
    })
  );
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing');

  testPrint.resolve();
  await screen.findByText('Print Failed');

  userEvent.click(screen.getButton('Retry'));
  await screen.findByText('Remove Paper Roll Holder');
});
