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
import { ToggleTestModeButton } from '../components/toggle_test_mode_button.js';
import { AppContext } from '../contexts/app_context.js';
import {
  ejectUsbDrive,
  getPollingPlaceId,
  logOut,
  setPollingPlaceId,
  unconfigure,
  useApiClient,
} from '../api.js';
import { NavigationScreen } from '../navigation_screen.js';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

export interface SettingsScreenProps {
  canUnconfigure: boolean;
  hasScannedBatches: boolean;
  isBatchOpen: boolean;
}

export function SettingsScreen({
  canUnconfigure,
  hasScannedBatches,
  isBatchOpen,
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

  const isEditingElectionSettingsDisabled = isBatchOpen || !canUnconfigure;

  return (
    <NavigationScreen title="Settings">
      <H2>Election</H2>
      <P>
        <ToggleTestModeButton disabled={isEditingElectionSettingsDisabled} />
      </P>
      <ButtonRow>
        <UnconfigureMachineButton
          disabled={isEditingElectionSettingsDisabled}
          unconfigureMachine={unconfigureMachine}
        />
      </ButtonRow>
      {isBatchOpen ? (
        <Caption>
          <Icons.Warning color="warning" /> You cannot change election settings
          while a batch is in progress.
        </Caption>
      ) : !canUnconfigure ? (
        <Caption>
          <Icons.Warning color="warning" /> You must save CVRs before changing
          election settings.
        </Caption>
      ) : undefined}

      <H2>Polling Place</H2>
      <P as="div">
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
          <Icons.Warning color="warning" /> You cannot change the polling place
          once ballots have been scanned.
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
