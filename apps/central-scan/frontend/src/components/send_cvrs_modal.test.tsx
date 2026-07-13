import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred, err, ok, Result } from '@votingworks/basics';
import type { SendCastVoteRecordsToHostError } from '@votingworks/central-scan-backend';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { SendCvrsModal } from './send_cvrs_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('renders a warning when no VxAdmin is connected', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({ status: 'waiting-for-host' });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('VxAdmin Not Detected');

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('sends CVRs to the connected host and shows the result', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('Send CVRs');
  screen.getByText(/ADMIN-01/);

  apiMock.expectSendCastVoteRecordsToHost(
    ok({ newlyAdded: 3, alreadyPresent: 0 })
  );
  userEvent.click(screen.getByText('Send'));
  await screen.findByText('CVRs Sent');
  screen.getByText(/VxAdmin loaded 3 new CVRs/);

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('shows progress while sending', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  apiMock.setSendCvrsProgress({ sent: 2, total: 5 });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('Send CVRs');

  const sendResult =
    deferred<
      Result<
        { newlyAdded: number; alreadyPresent: number },
        SendCastVoteRecordsToHostError
      >
    >();
  apiMock.apiClient.sendCastVoteRecordsToHost
    .expectCallWith()
    .returns(sendResult.promise);
  userEvent.click(screen.getByText('Send'));
  await screen.findByText(/Sending CVRs \(2 of 5\)/);

  sendResult.resolve(ok({ newlyAdded: 5, alreadyPresent: 0 }));
  await screen.findByText('CVRs Sent');
});

test('reports duplicates when CVRs were previously sent', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('Send CVRs');

  apiMock.expectSendCastVoteRecordsToHost(
    ok({ newlyAdded: 0, alreadyPresent: 3 })
  );
  userEvent.click(screen.getByText('Send'));
  await screen.findByText('CVRs Sent');
  screen.getByText(
    /VxAdmin loaded 0 new CVRs and ignored 3 previously sent CVRs/
  );
});

test('renders an error when sending fails', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('Send CVRs');

  apiMock.expectSendCastVoteRecordsToHost(
    err({ type: 'upload-failed', message: 'connection reset' })
  );
  userEvent.click(screen.getByText('Send'));
  await screen.findByText('Failed to Send CVRs');
  await screen.findByText(/connection reset/);

  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});

test('renders an error when the host disconnects before sending', async () => {
  const closeFn = vi.fn();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  renderInAppContext(<SendCvrsModal onClose={closeFn} />, { apiMock });
  await screen.findByText('Send CVRs');

  apiMock.expectSendCastVoteRecordsToHost(err({ type: 'no-host-connected' }));
  userEvent.click(screen.getByText('Send'));
  await screen.findByText('Failed to Send CVRs');
  await screen.findByText(/No VxAdmin is connected/);
});
