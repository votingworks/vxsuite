import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  SegmentedButton,
  UnconfigureMachineButton,
  SearchSelect,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import { Precinct } from '@votingworks/types';
import {
  getElection,
  getIsAbsenteeMode,
  setIsAbsenteeMode,
  setConfiguredPrecinct,
  unconfigure,
  getPollbookConfigurationInformation,
} from './api';
import { Column, FieldName, Row } from './layout';
import { StatisticsScreen } from './statistics_screen';
import { ElectionManagerVotersScreen } from './voters_screen';
import { VoterDetailsScreen } from './voter_details_screen';
import { VoterRegistrationScreen } from './voter_registration_screen';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen';

export function SettingsScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();
  const unconfigureMutation = unconfigure.useMutation();
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const setIsAbsenteeModeMutation = setIsAbsenteeMode.useMutation();
  const setConfiguredPrecinctMutation = setConfiguredPrecinct.useMutation();

  if (
    !getIsAbsenteeModeQuery.isSuccess ||
    !getElectionQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const election = getElectionQuery.data.unsafeUnwrap();
  const isAbsenteeMode = getIsAbsenteeModeQuery.data;

  // Get precinct options for SearchSelect
  const precinctOptions = election.precincts.map((precinct: Precinct) => ({
    value: precinct.id,
    label: precinct.name,
  }));

  // Find currently configured precinct (if any)
  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;

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
          <Row style={{ alignItems: 'center', gap: '1rem' }}>
            {precinctOptions.length > 1 && (
              <SearchSelect
                aria-label="Select Precinct"
                options={precinctOptions}
                value={configuredPrecinctId}
                onChange={(precinctId) => {
                  if (precinctId) {
                    setConfiguredPrecinctMutation.mutate({ precinctId });
                  }
                }}
                placeholder="Select Precinct…"
                style={{ minWidth: '16rem' }}
                isSearchable
              />
            )}
            <UnconfigureMachineButton
              unconfigureMachine={() => unconfigureMutation.mutateAsync()}
              isMachineConfigured
            />
          </Row>
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
        render={() => <SettingsScreen />}
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
      <Route
        path={electionManagerRoutes.addVoter.path}
        component={VoterRegistrationScreen}
      />
      <Route path="/voters/:voterId" component={VoterDetailsScreen} />
      <Redirect to={electionManagerRoutes.settings.path} />
    </Switch>
  );
}
