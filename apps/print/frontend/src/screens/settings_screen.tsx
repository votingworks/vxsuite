import {
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  P,
  SetClockButton,
  SignedHashValidationButton,
  ToggleUsbPortsButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import {
  logOut,
  useApiClient,
  getElectionRecord,
  unconfigureMachine,
  getDeviceStatuses,
} from '../api';
import { TitleBar } from '../components/title_bar';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';

const Content = styled.div`
  padding: 1rem;
`;

export function SettingsScreen({
  isSystemAdministrator,
}: {
  isSystemAdministrator?: boolean;
}): JSX.Element | null {
  const history = useHistory();

  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();

  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const electionRecordQuery = getElectionRecord.useQuery();
  const deviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!electionRecordQuery.isSuccess || !deviceStatusesQuery.isSuccess) {
    return null;
  }

  const isConfigured = electionRecordQuery.data !== null;
  const { usbDrive } = deviceStatusesQuery.data;
  async function unconfigure() {
    try {
      await unconfigureMachineMutation.mutateAsync();
      history.replace('/');
    } catch {
      // Handled by default query client error handling
    }
  }

  return (
    <div>
      <TitleBar title="Settings" />
      <Content>
        <H2>Election</H2>
        {isSystemAdministrator ? (
          <P>
            To adjust settings for the current election, please insert an
            election manager card.
          </P>
        ) : (
          <P>
            <ToggleTestModeButton />
          </P>
        )}
        <UnconfigureMachineButton
          isMachineConfigured={isConfigured}
          unconfigureMachine={unconfigure}
        />
        <H2>Logs</H2>
        <ExportLogsButton usbDriveStatus={usbDrive} />
        <H2>Date and Time</H2>
        <P>
          <CurrentDateAndTime />
        </P>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          Set Date and Time
        </SetClockButton>
        <H2>Security</H2>
        <P>
          <SignedHashValidationButton apiClient={apiClient} />
        </P>
        {isSystemAdministrator && (
          <P>
            <ToggleUsbPortsButton />
          </P>
        )}
      </Content>
    </div>
  );
}
