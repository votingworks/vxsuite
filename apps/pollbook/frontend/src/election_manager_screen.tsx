import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  SegmentedButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen';
import {
  getElection,
  getIsAbsenteeMode,
  setIsAbsenteeMode,
  unconfigure,
} from './api';
import { Column, Row } from './layout';
import { StatisticsScreen } from './statistics_screen';
import { VotersScreen } from './voters_screen';

export function ElectionScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery();
  assert(getElectionQuery.isSuccess);
  const election = getElectionQuery.data.unsafeUnwrap();

  const unconfigureMutation = unconfigure.useMutation();

  return (
    <ElectionManagerNavScreen title="Election">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
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
          <div>
            <UnconfigureMachineButton
              unconfigureMachine={() => unconfigureMutation.mutateAsync()}
              isMachineConfigured
            />
          </div>
        </Column>
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function SettingsScreen(): JSX.Element | null {
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const setIsAbsenteeModeMutation = setIsAbsenteeMode.useMutation();

  if (!getIsAbsenteeModeQuery.isSuccess) {
    return null;
  }
  const isAbsenteeMode = getIsAbsenteeModeQuery.data;

  return (
    <ElectionManagerNavScreen title="Settings">
      <MainContent>
        <SegmentedButton
          label="Check-In Mode"
          selectedOptionId={isAbsenteeMode ? 'absentee' : 'precinct'}
          options={[
            { label: 'Precinct Mode', id: 'precinct' },
            { label: 'Absentee Mode', id: 'absentee', icon: 'Envelope' },
          ]}
          onChange={(selectedId) =>
            setIsAbsenteeModeMutation.mutate({
              isAbsenteeMode: selectedId === 'absentee',
            })
          }
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function ElectionManagerScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.election.path}
        component={ElectionScreen}
      />
      <Route
        path={electionManagerRoutes.voters.path}
        component={VotersScreen}
      />
      <Route
        path={electionManagerRoutes.statistics.path}
        component={StatisticsScreen}
      />
      <Route
        path={electionManagerRoutes.settings.path}
        component={SettingsScreen}
      />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}
