import { useState, useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  Button,
  Caption,
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  Icons,
  Loading,
  Modal,
  P,
  SetClockButton,
  SignedHashValidationButton,
  UnconfigureMachineButton,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { AppContext } from '../contexts/app_context';
import {
  logOut,
  unconfigure,
  exportCastVoteRecordsToUsbDrive,
  ejectUsbDrive,
  useApiClient,
} from '../api';
import { NavigationScreen } from '../navigation_screen';

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
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  async function unconfigureMachine() {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync({ ignoreBackupRequirement: false });
      history.replace('/');
    } catch {
      // Handled by default query client error handling
    }
  }

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');

  function saveBackup() {
    setIsBackingUp(true);
    setBackupError('');
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { isMinimalExport: false },
      {
        onSuccess(result) {
          if (result.isErr()) {
            setBackupError(userReadableMessageFromExportError(result.err()));
          }
          setIsBackingUp(false);
        },
      }
    );
  }

  return (
    <NavigationScreen title="Settings">
      <H2>Election</H2>
      <P>
        <ToggleTestModeButton />
        <br />
        <Caption>
          <Icons.Info /> Switching the ballot mode clears all scanned ballot
          data.
        </Caption>
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
      {backupError && (
        <P>
          <Icons.Danger color="danger" /> {backupError}
        </P>
      )}
      <ButtonRow>
        <Button onPress={saveBackup} disabled={isBackingUp}>
          {isBackingUp ? 'Saving…' : 'Save Backup'}
        </Button>
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

      {isBackingUp && (
        <Modal centerContent content={<Loading>Saving Backup</Loading>} />
      )}
    </NavigationScreen>
  );
}
