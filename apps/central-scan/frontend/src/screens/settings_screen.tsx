import { useState, useContext } from 'react';
import { assert, err } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  Icons,
  Loading,
  Modal,
  P,
  SetClockButton,
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
  exportLogsToUsb,
} from '../api';
import { NavigationScreen } from '../navigation_screen';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

export interface SettingsScreenProps {
  isTestMode: boolean;
  canUnconfigure: boolean;
}

export function SettingsScreen({
  isTestMode,
  canUnconfigure,
}: SettingsScreenProps): JSX.Element {
  const history = useHistory();
  const { logger, auth, usbDriveStatus } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const exportLogsToUsbMutation = exportLogsToUsb.useMutation();

  async function doExportLogs(): Promise<LogsResultType> {
    try {
      return await exportLogsToUsbMutation.mutateAsync();
    } catch (e) {
      return err('copy-failed');
    }
  }

  async function unconfigureMachine() {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync({ ignoreBackupRequirement: false });
      history.replace('/');
    } catch (e) {
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
      <ButtonRow>
        <ToggleTestModeButton
          isTestMode={isTestMode}
          canUnconfigure={canUnconfigure}
        />
      </ButtonRow>
      <ButtonRow>
        <UnconfigureMachineButton
          isMachineConfigured={canUnconfigure}
          unconfigureMachine={unconfigureMachine}
        />
      </ButtonRow>

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
        <ExportLogsButton
          usbDriveStatus={usbDriveStatus}
          auth={auth}
          logger={logger}
          onExportLogs={doExportLogs}
        />
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
      {!canUnconfigure && !isTestMode && (
        <P>
          <Icons.Warning color="warning" /> You must &quot;Save Backup&quot;
          before you may delete election data.
        </P>
      )}
      {isBackingUp && (
        <Modal centerContent content={<Loading>Saving backup</Loading>} />
      )}
    </NavigationScreen>
  );
}
