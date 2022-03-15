import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { act } from 'react-dom/test-utils';
import MockDate from 'mockdate';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { AdminActionsScreen } from './admin_actions_screen';

test('clicking "Export Backup…" shows progress', async () => {
  const backup = jest.fn();
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches={false}
        unconfigureServer={jest.fn()}
        zeroData={jest.fn()}
        backup={backup}
        hasExportedBackupForAllBatches={false}
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  let resolve!: () => void;
  backup.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res;
    })
  );

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = component.getByText('Export Backup…');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress message is shown.
    await waitFor(() => component.getByText('Exporting…'));

    // Trigger backup finished, verify back to normal.
    resolve();
    await waitFor(() => component.getByText('Export Backup…'));
  });
});

test('"Delete Election Data from VxCentralScan…" is disabled when hasExportedBackupForAllBatches is falsy', async () => {
  const unconfigureServer = jest.fn();
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches={false}
        unconfigureServer={unconfigureServer}
        zeroData={jest.fn()}
        backup={jest.fn()}
        hasExportedBackupForAllBatches={false}
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  // Clicking the disabled "Delete Election Data" button should do nothing
  const resetButton = component.getByText(
    'Delete Election Data from VxCentralScan…'
  );
  resetButton.click();
  expect(unconfigureServer).not.toHaveBeenCalled();
  expect(component.queryByText('Delete all election data?')).toBeNull();
});

test('clicking "Delete Election Data from VxCentralScan…" shows progress', async () => {
  const unconfigureServer = jest.fn();
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches={false}
        unconfigureServer={unconfigureServer}
        zeroData={jest.fn()}
        backup={jest.fn()}
        hasExportedBackupForAllBatches
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  let resolve!: () => void;
  unconfigureServer.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res;
    })
  );

  // Click to reset.
  expect(unconfigureServer).not.toHaveBeenCalled();
  const resetButton = component.getByText(
    'Delete Election Data from VxCentralScan…'
  );
  resetButton.click();

  // Confirm reset.
  expect(unconfigureServer).not.toHaveBeenCalled();
  component.getByText('Delete all election data?');
  const confirmResetButton = await waitFor(() =>
    component.getByText('Yes, Delete Election Data')
  );
  confirmResetButton.click();
  component.getByText('Are you sure?');
  const doubleConfirmResetButton = await waitFor(() =>
    component.getByText('I am sure. Delete all election data.')
  );
  doubleConfirmResetButton.click();
  expect(unconfigureServer).toHaveBeenCalledTimes(1);

  // Verify progress message is shown.
  await waitFor(() => component.getByText('Deleting election data'));

  // Trigger reset finished, verify back to initial screen.
  resolve();
  await waitFor(() => !component.getByText('Deleting election data'));
});

test('clicking "Delete Ballot Data…" shows progress', async () => {
  const zeroData = jest.fn();
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches
        unconfigureServer={jest.fn()}
        zeroData={zeroData}
        backup={jest.fn()}
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  let resolve!: () => void;
  zeroData.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res;
    })
  );

  expect(zeroData).not.toHaveBeenCalled();
  await fireEvent.click(component.getByText('Delete Ballot Data…'));

  expect(zeroData).not.toHaveBeenCalled();
  await screen.findByText('Delete All Scanned Ballot Data?');
  await fireEvent.click(screen.getByText('Yes, Delete Ballot Data'));
  expect(zeroData).toHaveBeenCalledTimes(1);

  // Verify progress message is shown.
  await screen.findByText('Deleting ballot data');

  resolve();
  // Trigger delete finished, verify back to initial screen.
  await waitFor(async () => {
    expect(await screen.queryAllByText('Deleting ballot data')).toHaveLength(0);
  });
});

test('backup error shows message', async () => {
  const backup = jest.fn();
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches={false}
        unconfigureServer={jest.fn()}
        zeroData={jest.fn()}
        backup={backup}
        hasExportedBackupForAllBatches
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  let reject!: (reason?: unknown) => void;
  backup.mockReturnValueOnce(
    new Promise((_res, rej) => {
      reject = rej;
    })
  );

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = component.getByText('Export Backup…');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress message is shown.
    await waitFor(() => component.getByText('Exporting…'));

    // Trigger backup error, verify back to normal with error.
    reject(new Error('two is one and one is none'));
    await waitFor(() => component.getByText('Export Backup…'));
    await waitFor(() =>
      component.getByText('Error: two is one and one is none')
    );
  });
});

test('override mark thresholds button shows when there are no overrides', async () => {
  const backup = jest.fn();

  const testCases = [
    {
      hasBatches: true,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds…',
      expectButtonDisabled: true,
    },
    {
      hasBatches: true,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds…',
      expectButtonDisabled: true,
    },
    {
      hasBatches: false,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds…',
      expectButtonDisabled: false,
    },
    {
      hasBatches: false,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds…',
      expectButtonDisabled: false,
    },
  ];

  for (const testCase of testCases) {
    const { getByText, unmount } = render(
      <Router history={createMemoryHistory()}>
        <AdminActionsScreen
          hasBatches={testCase.hasBatches}
          unconfigureServer={jest.fn()}
          zeroData={jest.fn()}
          backup={backup}
          hasExportedBackupForAllBatches={false}
          isTestMode={false}
          isTogglingTestMode={false}
          toggleTestMode={jest.fn()}
          setMarkThresholdOverrides={jest.fn()}
          markThresholds={testCase.markThresholds}
          electionDefinition={testElectionDefinition}
        />
      </Router>
    );

    getByText(testCase.expectedText);
    expect(
      getByText(testCase.expectedText)
        .closest('button')!
        .hasAttribute('disabled')
    ).toBe(testCase.expectButtonDisabled);
    unmount();
  }
});

test('clicking "Update Date and Time…" shows modal to set clock', async () => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  window.kiosk = fakeKiosk();

  render(
    <Router history={createMemoryHistory()}>
      <AdminActionsScreen
        hasBatches={false}
        unconfigureServer={jest.fn()}
        zeroData={jest.fn()}
        backup={jest.fn()}
        hasExportedBackupForAllBatches={false}
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  );

  screen.getByRole('heading', { name: 'Admin Actions' });

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(
    screen.getByRole('button', { name: 'Update Date and Time…' })
  );

  // Open modal
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('Sat, Oct 31, 2020, 12:00 AM');

  // Change date
  const selectYear = screen.getByTestId('selectYear');
  userEvent.selectOptions(selectYear, '2025');

  // Save date
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(window.kiosk?.setClock).toHaveBeenCalledWith({
      isoDatetime: '2025-10-31T00:00:00.000+00:00',
      // eslint-disable-next-line vx/gts-identifiers
      IANAZone: 'UTC',
    });
  });
});
