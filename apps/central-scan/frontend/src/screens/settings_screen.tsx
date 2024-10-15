import { useState, useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  Button,
  Caption,
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  Icons,
  P,
  SetClockButton,
  SignedHashValidationButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { AppContext } from '../contexts/app_context';
import { logOut, unconfigure, ejectUsbDrive, useApiClient } from '../api';
import { NavigationScreen } from '../navigation_screen';
import { ExportResultsModal } from '../components/export_results_modal';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

export interface SettingsScreenProps {
  canUnconfigure: boolean;
}

export function SettingsScreen({
  canUnconfigure,
}: SettingsScreenProps): JSX.Element {
  const history = useHistory();
  const { auth, usbDriveStatus } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  async function unconfigureMachine() {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync({ ignoreBackupRequirement: false });
      history.replace('/');
    } catch {
      // Handled by default query client error handling
    }
  }

  const [isSavingBackup, setIsSavingBackup] = useState(false);

  return (
    <NavigationScreen title="Settings">
      <H2>Election</H2>
      <P>
        <ToggleTestModeButton />
      </P>
      <ButtonRow>
        <UnconfigureMachineButton
          isMachineConfigured={canUnconfigure}
          unconfigureMachine={unconfigureMachine}
        />
      </ButtonRow>
      {!canUnconfigure && (
        <Caption>
          <Icons.Warning color="warning" /> You must save a backup before you
          can unconfigure this machine.
        </Caption>
      )}

      <H2>Backup</H2>
      <ButtonRow>
        <Button onPress={() => setIsSavingBackup(true)}>Save Backup</Button>
      </ButtonRow>

      <H2>Logs</H2>
      <ButtonRow>
        <ExportLogsButton usbDriveStatus={usbDriveStatus} />
      </ButtonRow>

      <H2>Date and Time</H2>
      <P>
        <CurrentDateAndTime />
      </P>
      <ButtonRow>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          Set Date and Time
        </SetClockButton>
      </ButtonRow>

      <H2>Security</H2>
      <ButtonRow>
        <SignedHashValidationButton apiClient={apiClient} />
      </ButtonRow>

      {isSavingBackup && (
        <ExportResultsModal
          mode="backup"
          onClose={() => setIsSavingBackup(false)}
        />
      )}
    </NavigationScreen>
  );
}
