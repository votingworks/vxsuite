import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { formatElectionHashes } from '@votingworks/types';
import { screen, waitFor } from '../../test/react_testing_library';
import { electionDefinition, election } from '../../test/helpers/election';

import { render } from '../../test/test_utils';
import { SystemAdministratorScreen } from './system_administrator_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-10-31T00:00:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('SystemAdministratorScreen renders expected contents', () => {
  const unconfigureMachine = vi.fn();
  render(
    <SystemAdministratorScreen
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      machineConfig={mockMachineConfig({
        codeVersion: 'test', // Override default
      })}
      precinctSelection={undefined}
    />
  );

  // These buttons are further tested in libs/ui
  screen.getByRole('button', { name: 'Unconfigure Machine' });
  screen.getByRole('button', { name: 'Save Logs' });

  // Has election info bar
  screen.getByText(election.title);
  screen.getByText(
    formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )
  );
});

test('Can set date and time', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={vi.fn()}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('mounted')}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        machineConfig={mockMachineConfig({
          codeVersion: 'test', // Override default
        })}
        precinctSelection={undefined}
      />
    )
  );
  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getButton('Set Date and Time'));
  apiMock.mockApiClient.setClock
    .expectCallWith({
      isoDatetime: '2020-10-31T00:00:00.000-08:00',
      ianaZone: 'America/Anchorage',
    })
    .resolves();
  apiMock.expectLogOut();
  userEvent.click(screen.getButton('Save'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('navigates to Diagnostics screen', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={vi.fn()}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('mounted')}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        machineConfig={mockMachineConfig({
          codeVersion: 'test', // Override default
        })}
        precinctSelection={undefined}
      />
    )
  );

  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.setBatteryInfo();
  apiMock.expectGetIsAccessibleControllerInputDetected();
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-paper-handler');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-headphone-input');
  apiMock.expectGetMarkScanBmdModel();
  apiMock.expectGetApplicationDiskSpaceSummary();

  userEvent.click(screen.getButton('Diagnostics'));
  screen.getByRole('heading', { name: 'Diagnostics' });

  userEvent.click(await screen.findButton('Back'));
  screen.getButton('Diagnostics');
});
