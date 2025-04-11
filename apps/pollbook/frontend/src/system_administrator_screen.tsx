import {
  Card,
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  H2,
  MainContent,
  P,
  Seal,
  SetClockButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  SystemAdministratorNavScreen,
  systemAdministratorRoutes,
} from './nav_screen';
import {
  formatUsbDrive,
  getElection,
  getUsbDriveStatus,
  logOut,
  unconfigure,
} from './api';
import { Column, Row } from './layout';

export function SettingsScreen(): JSX.Element | null {
  const logOutMutation = logOut.useMutation();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;

  return (
    <SystemAdministratorNavScreen title="Settings">
      <MainContent>
        <H2>Logs</H2>
        <ExportLogsButton usbDriveStatus={usbDriveStatus} />
        <H2>Date and Time</H2>
        <P>
          <CurrentDateAndTime />
        </P>
        <P>
          <SetClockButton logOut={() => logOutMutation.mutate()}>
            Set Date and Time
          </SetClockButton>
        </P>
        <H2>USB</H2>
        <P>
          <FormatUsbButton
            usbDriveStatus={usbDriveStatus}
            formatUsbDriveMutation={formatUsbDriveMutation}
          />
        </P>
      </MainContent>
    </SystemAdministratorNavScreen>
  );
}

export function ElectionScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const unconfigureMutation = unconfigure.useMutation();

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const election = getElectionQuery.data.unsafeUnwrap();

  return (
    <SystemAdministratorNavScreen title="Election">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <div data-testid="election-info">
            <Card color="neutral">
              <Row style={{ gap: '1rem', alignItems: 'center' }}>
                <Seal seal={election.seal} maxWidth="7rem" />
                <div>
                  <H2>{election.title}</H2>
                  <P>
                    {election.county.name}, {election.state}
                    <br />
                    {format.localeLongDate(
                      election.date.toMidnightDatetimeWithSystemTimezone()
                    )}
                  </P>
                </div>
              </Row>
            </Card>
          </div>
          <div>
            <UnconfigureMachineButton
              unconfigureMachine={() => unconfigureMutation.mutateAsync()}
              isMachineConfigured
            />
          </div>
        </Column>
      </MainContent>
    </SystemAdministratorNavScreen>
  );
}

export function SystemAdministratorScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.election.path}
        component={ElectionScreen}
      />
      <Route
        path={systemAdministratorRoutes.settings.path}
        component={SettingsScreen}
      />
      <Redirect to={systemAdministratorRoutes.election.path} />
    </Switch>
  );
}
