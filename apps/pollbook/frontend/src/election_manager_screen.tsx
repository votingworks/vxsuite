import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  SegmentedButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen';
import {
  getElection,
  getIsAbsenteeMode,
  setIsAbsenteeMode,
  unconfigure,
} from './api';
import { Column, FieldName, Row } from './layout';
import { StatisticsScreen } from './statistics_screen';
import { ElectionManagerVotersScreen } from './voters_screen';
import { VoterDetailsScreen } from './voter_details_screen';

export function SettingsScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const unconfigureMutation = unconfigure.useMutation();
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const setIsAbsenteeModeMutation = setIsAbsenteeMode.useMutation();

  if (!getIsAbsenteeModeQuery.isSuccess || !getElectionQuery.isSuccess) {
    return null;
  }

  const election = getElectionQuery.data.unsafeUnwrap();
  const isAbsenteeMode = getIsAbsenteeModeQuery.data;

  return (
    <ElectionManagerNavScreen title="Settings">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <Row>
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
          </Row>
          <div data-testid="election-info">
            <FieldName>Election</FieldName>
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
    </ElectionManagerNavScreen>
  );
}

export function ElectionManagerScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.settings.path}
        component={SettingsScreen}
      />
      <Route
        exact
        path={electionManagerRoutes.voters.path}
        component={ElectionManagerVotersScreen}
      />
      <Route
        path={electionManagerRoutes.statistics.path}
        component={StatisticsScreen}
      />
      <Route path="/voters/:voterId" component={VoterDetailsScreen} />
      <Redirect to={electionManagerRoutes.settings.path} />
    </Switch>
  );
}
