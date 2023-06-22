import React, { useEffect } from 'react';

import {
  P,
  Button,
  ChangePrecinctButton,
  CurrentDateAndTime,
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
  SegmentedButton,
  SetClockButton,
  TestMode,
  UsbControllerButton,
  UsbDrive,
  Caption,
  Font,
  Icons,
  H3,
  H6,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { isElectionManagerAuth, makeAsync } from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import type { MachineConfig } from '@votingworks/mark-backend';
import { assert } from '@votingworks/basics';
import { ScreenReader } from '../config/types';
import { getAuthStatus, updateSessionExpiry } from '../api';

export interface AdminScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  updateAppPrecinct: (appPrecinct: PrecinctSelection) => void;
  toggleLiveMode: VoidFunction;
  unconfigure: () => Promise<void>;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  pollsState: PollsState;
  logger: Logger;
  usbDrive: UsbDrive;
}

export function AdminScreen({
  appPrecinct,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  updateAppPrecinct,
  toggleLiveMode,
  unconfigure,
  machineConfig,
  screenReader,
  pollsState,
  logger,
  usbDrive,
}: AdminScreenProps): JSX.Element | null {
  const { election } = electionDefinition;
  const authStatusQuery = getAuthStatus.useQuery();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  // Disable the audiotrack when in admin mode
  useEffect(() => {
    const initialMuted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(initialMuted);
  }, [screenReader]);

  if (!authStatusQuery.isSuccess) {
    return null;
  }
  const authStatus = authStatusQuery.data;
  assert(isElectionManagerAuth(authStatus));

  return (
    <Screen>
      {election && !isLiveMode && <TestMode />}
      <Main padded>
        <Prose>
          <H3 as="h1">
            VxMark{' '}
            <Font weight="light" noWrap>
              Election Manager Actions
            </Font>
          </H3>
          <Caption weight="bold">
            <Icons.Info /> Remove card when finished.
          </Caption>
          {election && (
            <React.Fragment>
              <H6 as="h2">Stats</H6>
              <P>
                Ballots Printed: <strong>{ballotsPrintedCount}</strong>
              </P>
              <H6 as="h2">
                <label htmlFor="selectPrecinct">Precinct</label>
              </H6>
              <P>
                <ChangePrecinctButton
                  appPrecinctSelection={appPrecinct}
                  updatePrecinctSelection={makeAsync(updateAppPrecinct)}
                  election={election}
                  mode={
                    pollsState === 'polls_closed_final' ||
                    election.precincts.length === 1
                      ? 'disabled'
                      : 'default'
                  }
                  logger={logger}
                />
                <br />
                <Caption>
                  Changing the precinct will reset the Ballots Printed count.
                </Caption>
                {election.precincts.length === 1 && (
                  <React.Fragment>
                    <br />
                    <Caption>
                      Precinct cannot be changed because there is only one
                      precinct configured for this election.
                    </Caption>
                  </React.Fragment>
                )}
              </P>
              <H6 as="h2">Test Ballot Mode</H6>
              <P>
                <SegmentedButton
                  label="Test Ballot Mode"
                  hideLabel
                  onChange={toggleLiveMode}
                  options={[
                    { id: 'test', label: 'Test Ballot Mode' },
                    { id: 'official', label: 'Official Ballot Mode' },
                  ]}
                  selectedOptionId={isLiveMode ? 'official' : 'test'}
                />
                <br />
                <Caption>
                  Switching the mode will reset the Ballots Printed count.
                </Caption>
              </P>
            </React.Fragment>
          )}
          <H6 as="h2">Current Date and Time</H6>
          <P>
            <Caption>
              <CurrentDateAndTime />
            </Caption>
          </P>
          <P>
            <SetClockButton
              sessionExpiresAt={authStatus.sessionExpiresAt}
              updateSessionExpiry={async (sessionExpiresAt: Date) => {
                try {
                  await updateSessionExpiryMutation.mutateAsync({
                    sessionExpiresAt,
                  });
                } catch {
                  // Handled by default query client error handling
                }
              }}
            >
              Update Date and Time
            </SetClockButton>
          </P>
          <H6 as="h2">Configuration</H6>
          <P>
            <Font color="success">
              <Icons.Checkbox />
            </Font>{' '}
            Election Definition is loaded.{' '}
          </P>
          <Button variant="danger" small onPress={unconfigure}>
            Unconfigure Machine
          </Button>
          <H6 as="h2">USB</H6>
          <UsbControllerButton
            small={false}
            primary
            usbDriveStatus={usbDrive.status}
            usbDriveEject={() => usbDrive.eject('election_manager')}
          />
        </Prose>
      </Main>
      {election && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          precinctSelection={appPrecinct}
        />
      )}
    </Screen>
  );
}
