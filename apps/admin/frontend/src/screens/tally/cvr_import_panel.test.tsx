import { beforeEach, describe, expect, test, vi } from 'vitest';

import type {
  CastVoteRecordFileRecord as CvrImport,
  CvrFileImportInfo as CvrImportOk,
  ImportCastVoteRecordsError as CvrImportErr,
  CastVoteRecordFileMetadata as CvrExport,
} from '@votingworks/admin-backend';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { mockKiosk } from '@votingworks/test-utils';
import { deferred, err, ok, Result, sleep } from '@votingworks/basics';

import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import { CvrImportPanel } from './cvr_import_panel';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { errorMessage } from './cvr_importer';
import {
  electionDefinition,
  location1,
  location1Export,
  location2,
  location2Export,
} from '../../../test/helpers/cvrs';

beforeEach(() => {
  window.kiosk = mockKiosk(vi.fn);
});

describe('title reflects CVR mode', () => {
  async function expectTitle(api: ApiMock, title: string) {
    render(<CvrImportPanel onClose={vi.fn()} />, {
      api,
      usbStatus: 'no_drive',
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
  render(<CvrImportPanel onClose={onClose} />, { api, usbStatus: 'no_drive' });

  await waitFor(() => api.assertComplete());
  screen.getByText('No USB Drive Detected');

  expect(onClose).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Done'));
  expect(onClose).toHaveBeenCalledOnce();
});

test('shows alert modal on import errors', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, [location1Export, location2Export]);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });
  await waitFor(() => api.assertComplete());

  const error: CvrImportErr = {
    type: 'invalid-cast-vote-record',
    index: 2,
    subType: 'contest-not-found',
  };
  mockImportResult(api, location2Export.path, err(error));
  mockModeUnlocked(api);

  userEvent.click(screen.getButton(new RegExp(location2.name)));
  await waitFor(() => api.assertComplete());

  const modal = screen.getByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Error' });
  expect(modal).toHaveTextContent(
    `error reading the contents of ${location2Export.path}`
  );
  expect(modal).toHaveTextContent(errorMessage(error));

  userEvent.click(screen.getButton('Close'));
  await sleep(0);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('shows alert modal on duplicate import', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, [location1Export, location2Export]);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });
  await waitFor(() => api.assertComplete());

  const res = resultFromExport(location1Export, { wasExistingFile: true });
  mockImportResult(api, location1Export.path, ok(res));
  mockModeUnlocked(api);

  userEvent.click(screen.getButton(new RegExp(location1.name)));
  await waitFor(() => api.assertComplete());

  const modal = screen.getByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Duplicate Export' });
  expect(modal).toHaveTextContent('ignored as a duplicate');

  userEvent.click(screen.getButton('Close'));
  await sleep(0);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

describe('shows alert modal on partial import', () => {
  async function expectAlert(
    result: Partial<CvrImportOk>,
    content: {
      heading: string;
      body: string | RegExp;
    }
  ) {
    const api = createApiMock();
    mockModeUnlocked(api);
    mockUsbExports(api, [location1Export, location2Export]);

    render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });

    await waitFor(() => api.assertComplete());
    screen.getButton(new RegExp(location1.name));

    const res = resultFromExport(location1Export, result);
    mockImportResult(api, location1Export.path, ok(res));
    mockModeOfficial(api, []);

    userEvent.click(screen.getButton(new RegExp(location1.name)));
    await waitFor(() => api.assertComplete());

    const modal = screen.getByRole('alertdialog');
    within(modal).getByRole('heading', { name: content.heading });
    expect(modal).toHaveTextContent(content.body);

    userEvent.click(screen.getButton('Close'));
    await sleep(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  }

  test('multiple existing, multiple new', () =>
    expectAlert(
      { alreadyPresent: 2, newlyAdded: 4 },
      {
        heading: '4 New CVRs Loaded',
        body: /2 of the 6 total CVRs.+were previously loaded/,
      }
    ));

  test('1 existing, multiple new', () =>
    expectAlert(
      { alreadyPresent: 1, newlyAdded: 2 },
      {
        heading: '2 New CVRs Loaded',
        body: /1 of the 3 total CVRs.+was previously loaded/,
      }
    ));

  test('1 new', () =>
    expectAlert(
      { alreadyPresent: 2, newlyAdded: 1 },
      {
        heading: '1 New CVR Loaded',
        body: /2 of the 3 total CVRs.+were previously loaded/,
      }
    ));

  test('1 existing, 0 new', () =>
    expectAlert(
      { alreadyPresent: 1, newlyAdded: 0 },
      {
        heading: 'No New CVRs Loaded',
        body: /The only CVR.+was previously loaded/,
      }
    ));
});

test('no alerts on successful, full import', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, [location1Export, location2Export]);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });

  await waitFor(() => api.assertComplete());
  screen.getButton(new RegExp(location1.name));

  const res = resultFromExport(location1Export, {});
  mockImportResult(api, location1Export.path, ok(res));
  mockModeOfficial(api, []);

  userEvent.click(screen.getButton(new RegExp(location1.name)));
  await waitFor(() => api.assertComplete());

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('disables controls while importing', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, [location1Export, location2Export]);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });

  await waitFor(() => api.assertComplete());
  screen.getButton(new RegExp(location1.name));

  const res = resultFromExport(location1Export, {});
  const deferredRes = deferred<CvrImportResult>();
  api.apiClient.addCastVoteRecordFile
    .expectCallWith({ path: location1Export.path })
    .returns(deferredRes.promise);

  userEvent.click(screen.getButton(new RegExp(location1.name)));
  await waitFor(() => api.assertComplete());

  expect(screen.getButton(new RegExp(location1.name))).toBeDisabled();
  expect(screen.getButton(new RegExp(location2.name))).toBeDisabled();
  expect(screen.getButton(/Select CVR Export Manually/)).toBeDisabled();
  expect(screen.getButton('Done')).toBeDisabled();

  mockModeOfficial(api, []);
  deferredRes.resolve(ok(res));
  await waitFor(() => api.assertComplete());
});

test('supports manual file selection', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, []);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });
  await waitFor(() => api.assertComplete());

  const mockPath = '/foo/metadata.json';
  vi.mocked(window.kiosk)?.showOpenDialog.mockResolvedValueOnce({
    canceled: false,
    filePaths: [mockPath],
  });

  const res = resultFromExport(location1Export, {});
  mockImportResult(api, mockPath, ok(res));
  mockModeOfficial(api, []);

  userEvent.click(screen.getButton(/Select CVR Export Manually/));
  await waitFor(() => api.assertComplete());
});

test('handles user cancellation in manual file selection', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, []);

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });
  await waitFor(() => api.assertComplete());

  vi.mocked(window.kiosk)?.showOpenDialog.mockResolvedValueOnce({
    canceled: true,
    filePaths: [],
  });

  userEvent.click(screen.getButton(/Select CVR Export Manually/));
  await waitFor(() => api.assertComplete());
});

test('omits manual file selector when running outside kiosk-browser', async () => {
  const api = createApiMock();
  mockModeUnlocked(api);
  mockUsbExports(api, []);

  delete window.kiosk;

  render(<CvrImportPanel onClose={vi.fn()} />, { api, usbStatus: 'mounted' });
  await waitFor(() => api.assertComplete());

  expect(screen.queryButton(/Select.+Manually/)).not.toBeInTheDocument();
});

type CvrImportResult = Result<CvrImportOk, CvrImportErr>;

function mockImportResult(api: ApiMock, path: string, result: CvrImportResult) {
  api.apiClient.addCastVoteRecordFile.expectCallWith({ path }).resolves(result);
}

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

function mockUsbExports(api: ApiMock, exports: CvrExport[]) {
  api.expectListCastVoteRecordFilesOnUsb(exports);
}

function render(
  ui: React.ReactNode,
  p: { api: ApiMock; usbStatus: UsbDriveStatus['status'] }
) {
  renderInAppContext(ui, {
    electionDefinition,
    apiMock: p.api,
    usbDriveStatus: mockUsbDriveStatus(p.usbStatus),
  });
}

function resultFromExport(
  e: CvrExport,
  overrides: Partial<CvrImportOk>
): CvrImportOk {
  return {
    alreadyPresent: 0,
    exportedTimestamp: e.exportTimestamp.toISOString(),
    fileMode: e.isTestModeResults ? 'test' : 'official',
    fileName: e.name,
    id: e.name,
    newlyAdded: e.cvrCount,
    wasExistingFile: false,
    ...overrides,
  };
}
