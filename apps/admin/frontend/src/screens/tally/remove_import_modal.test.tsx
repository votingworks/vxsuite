import { expect, test, vi } from 'vitest';

import type { CastVoteRecordFileRecord as CvrImport } from '@votingworks/admin-backend';

import { deferred } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '../../../test/react_testing_library';
import { RemoveImportModal } from './remove_import_modal';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { createApiMock } from '../../../test/helpers/mock_api_client';

const exportDate = new Date('2020-01-02T18:00:00');
const fileId = 'import1';

test('shows CVR import details', () => {
  const api = createApiMock();

  renderInAppContext(
    <RemoveImportModal
      close={vi.fn()}
      cvrImport={mockCvrImport({ numCvrsImported: 4112 })}
    />,
    { apiMock: api }
  );

  screen.getByRole('heading', { name: 'Remove CVR File' });
  screen.getByText(/The 4,112 CVRs.+will be permanently deleted/);
  screen.getByText('Exported:');
  screen.getByText(/2020.+6:00 PM/);
  screen.getByText('Scanners:');
  screen.getByText('SCAN-001');
});

test('handles single CVR case', () => {
  const api = createApiMock();

  renderInAppContext(
    <RemoveImportModal
      close={vi.fn()}
      cvrImport={mockCvrImport({ numCvrsImported: 1 })}
    />,
    { apiMock: api }
  );

  screen.getByText(/The 1 CVR.+will be permanently deleted/);
});

test('loading state', async () => {
  const api = createApiMock();

  const { promise, resolve } = deferred<void>();
  api.apiClient.deleteCvrFile.expectCallWith({ fileId }).returns(promise);

  renderInAppContext(
    <RemoveImportModal
      close={vi.fn()}
      cvrImport={mockCvrImport({ numCvrsImported: 1 })}
    />,
    { apiMock: api }
  );

  userEvent.click(screen.getButton('Remove'));
  await waitFor(() => api.assertComplete());

  expect(screen.getButton('Removing')).toBeDisabled();
  expect(screen.getButton('Cancel')).toBeDisabled();

  resolve();
  expect(await screen.findButton('Remove')).toBeEnabled();
  expect(screen.getButton('Cancel')).toBeEnabled();
});

function mockCvrImport(partial: Partial<CvrImport>): CvrImport {
  return {
    createdAt: exportDate.toISOString(),
    electionId: 'election1',
    exportTimestamp: exportDate.toISOString(),
    filename: 'import1.json',
    id: fileId,
    numCvrsImported: 1,
    pollingPlaceIds: ['place1'],
    precinctIds: ['precinct1'],
    scannerIds: ['SCAN-001'],
    sha256Hash: 'hash',
    ...partial,
  };
}
