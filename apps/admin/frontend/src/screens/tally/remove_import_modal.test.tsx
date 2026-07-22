import { expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';

import { renderInAppContext } from '../../../test/render_in_app_context';
import { RemoveImportModal } from './remove_import_modal';
import { LocationCvrImport } from './location_cvrs_panel';
import { createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../../test/react_testing_library';

const cvrImport: LocationCvrImport = {
  id: 'file-1',
  exportTimestamp: '2020-11-07T08:00:00',
  numCvrsImported: 412,
  scannerIds: ['SCAN-01-0001'],
  source: 'network',
  batchLabels: ['Batch 7'],
};

test('removes the import on confirmation', async () => {
  const api = createApiMock();
  const onClose = vi.fn();

  renderInAppContext(
    <RemoveImportModal cvrImport={cvrImport} onClose={onClose} />,
    {
      apiMock: api,
    }
  );

  screen.getByRole('heading', {
    name: 'Remove Scanner SCAN-01-0001, Batch 7',
  });
  screen.getByText(
    /412 CVRs loaded from this import will be permanently deleted/
  );

  api.apiClient.deleteCastVoteRecordFile
    .expectCallWith({ fileId: 'file-1' })
    .resolves(ok());
  userEvent.click(screen.getButton('Remove'));

  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test('cancels without removing', () => {
  const api = createApiMock();
  const onClose = vi.fn();

  renderInAppContext(
    <RemoveImportModal cvrImport={cvrImport} onClose={onClose} />,
    {
      apiMock: api,
    }
  );

  userEvent.click(screen.getButton('Cancel'));
  expect(onClose).toHaveBeenCalledOnce();
});
