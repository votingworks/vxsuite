import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';
import { fakeKiosk } from '@votingworks/test-utils';

import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { render } from '../../test/react_testing_library';
import { CastVoteRecordSyncRequiredScreen } from './cast_vote_record_sync_required_screen';

let apiMock: ApiMock;

function renderComponent({
  setShouldStayOnCastVoteRecordSyncRequiredScreen = jest.fn(),
  isAuthenticated = false,
}: {
  setShouldStayOnCastVoteRecordSyncRequiredScreen?: (
    shouldStayOnCastVoteRecordSyncRequiredScreen: boolean
  ) => void;
  isAuthenticated?: boolean;
} = {}) {
  render(
    provideApi(
      apiMock,
      <CastVoteRecordSyncRequiredScreen
        setShouldStayOnCastVoteRecordSyncRequiredScreen={
          setShouldStayOnCastVoteRecordSyncRequiredScreen
        }
        isAuthenticated={isAuthenticated}
      />
    )
  );
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('CVR sync shows voter screen when not authenticated', async () => {
  const setShouldStayOnCastVoteRecordSyncRequiredScreen = jest.fn();
  renderComponent({
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
    isAuthenticated: false,
  });

  await screen.findByText(
    'A poll worker must sync cast vote records (CVRs) to the USB drive.'
  );
});

test('CVR sync modal success case', async () => {
  const setShouldStayOnCastVoteRecordSyncRequiredScreen = jest.fn();
  renderComponent({
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
    isAuthenticated: true,
  });

  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.expectExportCastVoteRecordsToUsbDrive();
  userEvent.click(screen.getByRole('button', { name: 'Sync CVRs' }));
  const modal = await screen.findByRole('alertdialog');
  expect(setShouldStayOnCastVoteRecordSyncRequiredScreen).toHaveBeenCalledTimes(
    1
  );
  expect(
    setShouldStayOnCastVoteRecordSyncRequiredScreen
  ).toHaveBeenNthCalledWith(1, true);
  await within(modal).findByText('Syncing CVRs');
  await within(modal).findByText('Voters may continue casting ballots.');

  userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
  expect(setShouldStayOnCastVoteRecordSyncRequiredScreen).toHaveBeenCalledTimes(
    2
  );
  expect(
    setShouldStayOnCastVoteRecordSyncRequiredScreen
  ).toHaveBeenNthCalledWith(2, false);
});

test('CVR sync modal error case', async () => {
  const setShouldStayOnCastVoteRecordSyncRequiredScreen = jest.fn();
  renderComponent({
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
    isAuthenticated: true,
  });

  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'file-system-error', message: '' }));
  userEvent.click(screen.getByRole('button', { name: 'Sync CVRs' }));
  const modal = await screen.findByRole('alertdialog');
  expect(setShouldStayOnCastVoteRecordSyncRequiredScreen).toHaveBeenCalledTimes(
    1
  );
  expect(
    setShouldStayOnCastVoteRecordSyncRequiredScreen
  ).toHaveBeenNthCalledWith(1, true);
  await within(modal).findByText('Syncing CVRs');
  await within(modal).findByText(
    'Try restarting the machine or inserting a different USB drive.'
  );

  userEvent.click(within(modal).getByRole('button', { name: 'Restart' }));
  expect(window.kiosk?.reboot).toHaveBeenCalledTimes(1);

  userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(setShouldStayOnCastVoteRecordSyncRequiredScreen).toHaveBeenCalledTimes(
    2
  );
  expect(
    setShouldStayOnCastVoteRecordSyncRequiredScreen
  ).toHaveBeenNthCalledWith(2, false);
});
