import userEvent from '@testing-library/user-event';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { render, screen, waitFor } from '../../../test/react_testing_library';
import {
  PollWorkerLoadAndReprintButton,
  PollWorkerLoadAndReprintButtonProps,
} from './poll_worker_load_and_reprint_button';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderButton(
  props: Partial<PollWorkerLoadAndReprintButtonProps> = {}
) {
  return render(
    provideApi(
      apiMock,
      <PollWorkerLoadAndReprintButton
        reprint={jest.fn()}
        reprintText="Reprint"
        {...props}
      />
    )
  );
}

test('with paper loaded, simply a reprint button', async () => {
  apiMock.setPrinterStatusV4();
  const reprint = jest.fn();
  renderButton({ reprint });

  userEvent.click(await screen.findButton('Reprint'));

  expect(reprint).toHaveBeenCalled();
});

test('button disabled by prop', async () => {
  apiMock.setPrinterStatusV4();
  renderButton({ disablePrinting: true });

  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });

  expect(await screen.findButton('Reprint')).toBeDisabled();
});

test('button disabled by error status', async () => {
  apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
  renderButton();

  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });

  expect(await screen.findButton('Reprint')).toBeDisabled();
});

test('load paper flow enabled in cover open state', async () => {
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  renderButton();

  await screen.findButton('Load Paper');
});

test('happy path (if loading paper)', async () => {
  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  renderButton();

  userEvent.click(await screen.findButton('Load Paper'));
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');

  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');

  apiMock.setPrinterStatusV4({ state: 'idle' });
  await screen.findByText('Paper Loaded');

  userEvent.click(screen.getButton('Close'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  await screen.findButton('Reprint');
});

test('error or user error during loading flow', async () => {
  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  renderButton();

  userEvent.click(await screen.findButton('Load Paper'));
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  await screen.findByText('Load New Paper Roll');

  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  await screen.findByText('No Paper Detected');

  apiMock.setPrinterStatusV4({ state: 'error', type: 'disconnected' });
  await screen.findByText('Printer Error');

  userEvent.click(screen.getButton('Close'));
});

test('cancel loading flow', async () => {
  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  renderButton();

  userEvent.click(await screen.findButton('Load Paper'));
  await screen.findByRole('alertdialog');
  screen.getByText('Remove Paper Roll Holder');

  userEvent.click(screen.getButton('Cancel'));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
