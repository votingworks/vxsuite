import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';

import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { render } from '../../test/react_testing_library';
import { CastVoteRecordSyncModal } from './cast_vote_record_sync_modal';

let apiMock: ApiMock;

function renderComponent() {
  render(provideApi(apiMock, <CastVoteRecordSyncModal />));
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetUsbDriveStatus('no_drive');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('CVR sync modal success case', async () => {
  renderComponent();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.expectExportCastVoteRecordsToUsbDrive({ mode: 'full_export' });
  userEvent.click(within(modal).getByRole('button', { name: 'Sync CVRs' }));
  await within(modal).findByText('Syncing CVRs');
  await within(modal).findByText('Voters may continue casting ballots.');
  apiMock.expectGetUsbDriveStatus('mounted');

  userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  await waitFor(() => apiMock.mockApiClient.assertComplete());
});

test('CVR sync modal error case', async () => {
  renderComponent();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
      'Cast vote records (CVRs) need to be synced to the USB drive.'
  );

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ mode: 'full_export' })
    .resolves(err({ type: 'file-system-error', message: '' }));
  userEvent.click(within(modal).getByRole('button', { name: 'Sync CVRs' }));
  await within(modal).findByText('Syncing CVRs');
  await within(modal).findByText('Try inserting a different USB drive.');
});
