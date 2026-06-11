import { useContext } from 'react';
import { assert, assertDefined } from '@votingworks/basics';
import {
  Caption,
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  Icons,
  P,
  PollingPlacePicker,
  SetClockButton,
  SignedHashValidationButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { AppContext } from '../contexts/app_context';
import {
  ejectUsbDrive,
  getPollingPlaceId,
  logOut,
  setPollingPlaceId,
  unconfigure,
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
  hasScannedBatches: boolean;
}

export function SettingsScreen({
  canUnconfigure,
  hasScannedBatches,
}: SettingsScreenProps): JSX.Element {
  const history = useHistory();
  const { auth, electionDefinition, usbDriveStatus } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();
  const setPollingPlaceIdMutation = setPollingPlaceId.useMutation();

  const { election } = assertDefined(electionDefinition);
  const pollingPlaces = assertDefined(election.pollingPlaces);

  async function unconfigureMachine() {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync({ ignoreBackupRequirement: false });
      history.replace('/');
    } catch {
      // Handled by default query client error handling
    }
  }

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
          <Icons.Warning color="warning" /> You must save CVRs before you can
          unconfigure this machine.
        </Caption>
      )}

      <H2>Polling Place</H2>
      <P>
        <PollingPlacePicker
          mode={hasScannedBatches ? 'disabled' : 'default'}
          includedTypes={['absentee', 'election_day', 'early_voting']}
          places={pollingPlaces}
          selectedId={pollingPlaceIdQuery.data ?? undefined}
          selectPlace={(id) => setPollingPlaceIdMutation.mutateAsync({ id })}
          searchable
          style={{ width: '16rem' }}
        />
      </P>
      {hasScannedBatches && (
        <Caption>
          <Icons.Warning color="warning" /> The polling place cannot be changed
          after scanning has begun.
        </Caption>
      )}

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
    </NavigationScreen>
  );
}
