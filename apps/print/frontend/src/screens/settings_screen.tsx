import {
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  P,
  SetClockButton,
  SignedHashValidationButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import {
  logOut,
  useApiClient,
  getElectionDefinition,
  unconfigureMachine,
  getUsbDriveStatus,
} from '../api';
import { TitleBar } from '../components/title_bar';

const Content = styled.div`
  padding: 1rem;
`;

export function SettingsScreen(): JSX.Element | null {
  const history = useHistory();

  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();

  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const usbStatusQuery = getUsbDriveStatus.useQuery();

  if (!electionDefinitionQuery.isSuccess || !usbStatusQuery.isSuccess) {
    return null;
  }

  const isConfigured = electionDefinitionQuery.data !== null;
  const usbStatus = usbStatusQuery.data;
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
        <UnconfigureMachineButton
          isMachineConfigured={isConfigured}
          unconfigureMachine={unconfigure}
        />
        <H2>Logs</H2>
        <ExportLogsButton usbDriveStatus={usbStatus} />
        <H2>Date and Time</H2>
        <P>
          <CurrentDateAndTime />
        </P>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          Set Date and Time
        </SetClockButton>
        <H2>Security</H2>
        <SignedHashValidationButton apiClient={apiClient} />
      </Content>
    </div>
  );
}
