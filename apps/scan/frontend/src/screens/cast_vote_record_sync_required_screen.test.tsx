import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';

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
}: {
  setShouldStayOnCastVoteRecordSyncRequiredScreen?: (
    shouldStayOnCastVoteRecordSyncRequiredScreen: boolean
  ) => void;
} = {}) {
  render(
    provideApi(
      apiMock,
      <CastVoteRecordSyncRequiredScreen
        setShouldStayOnCastVoteRecordSyncRequiredScreen={
          setShouldStayOnCastVoteRecordSyncRequiredScreen
        }
      />
    )
  );
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('CVR sync modal success case', async () => {
  const setShouldStayOnCastVoteRecordSyncRequiredScreen = jest.fn();
  renderComponent({ setShouldStayOnCastVoteRecordSyncRequiredScreen });

  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'full_export' });
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
  renderComponent({ setShouldStayOnCastVoteRecordSyncRequiredScreen });

  await screen.findByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ mode: 'full_export' })
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
  await within(modal).findByText('Try inserting a different USB drive.');

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
