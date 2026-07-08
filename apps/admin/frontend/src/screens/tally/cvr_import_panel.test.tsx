import { describe, expect, test, vi } from 'vitest';

import type { CastVoteRecordFileRecord as CvrImport } from '@votingworks/admin-backend';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';

import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../../test/react_testing_library';
import { CvrImportPanel } from './cvr_import_panel';
import { renderInAppContext } from '../../../test/render_in_app_context';

const electionDefinition = readElectionGeneralDefinition();

describe('title reflects CVR mode', () => {
  async function expectTitle(api: ApiMock, title: string) {
    render(<CvrImportPanel onClose={vi.fn()} />, {
      api,
      usbStatus: mockUsbDriveStatus('no_drive'),
    });

    await waitFor(() => api.assertComplete());
    screen.getByRole('heading', { name: title });
  }

  test('mode = unlocked', async () => {
    const api = createApiMock();
    mockModeUnlocked(api);
    await expectTitle(api, 'Load CVRs');
  });

  test('mode = test', async () => {
    const api = createApiMock();
    mockModeTest(api, []);
    await expectTitle(api, 'Load Test Ballot CVRs');
  });

  test('mode = official', async () => {
    const api = createApiMock();
    mockModeOfficial(api, []);
    await expectTitle(api, 'Load Official Ballot CVRs');
  });
});

test('shows "no USB" callout', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);

  const onClose = vi.fn();
  render(<CvrImportPanel onClose={onClose} />, {
    api,
    usbStatus: mockUsbDriveStatus('no_drive'),
  });

  await waitFor(() => api.assertComplete());
  screen.getByText('No USB Drive Detected');

  expect(onClose).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Done'));
  expect(onClose).toHaveBeenCalledOnce();
});

function mockModeOfficial(api: ApiMock, imports: CvrImport[]) {
  api.expectGetCastVoteRecordFileMode('official');
  api.expectGetCastVoteRecordFiles(imports);
}

function mockModeTest(api: ApiMock, imports: CvrImport[]) {
  api.expectGetCastVoteRecordFileMode('test');
  api.expectGetCastVoteRecordFiles(imports);
}

function mockModeUnlocked(api: ApiMock) {
  api.expectGetCastVoteRecordFileMode('unlocked');
  api.expectGetCastVoteRecordFiles([]);
}

function render(
  ui: React.ReactNode,
  p: { api: ApiMock; usbStatus: UsbDriveStatus }
) {
  renderInAppContext(ui, {
    electionDefinition,
    apiMock: p.api,
    usbDriveStatus: p.usbStatus,
  });
}
