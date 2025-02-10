import {
  Button,
  Card,
  Font,
  H2,
  Icons,
  MainContent,
  P,
  SegmentedButton,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen';
import {
  getElection,
  getIsAbsenteeMode,
  setIsAbsenteeMode,
  unconfigure,
  undoVoterCheckIn,
} from './api';
import { Column, Row } from './layout';
import { VoterSearch } from './voter_search_screen';

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
            <H2>{election.title}</H2>
            <P>
              {format.localeLongDate(
                election.date.toMidnightDatetimeWithSystemTimezone()
              )}
              <br />
              {assertDefined(election.precincts[0]).name}
            </P>
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

export function VotersScreen(): JSX.Element {
  const undoVoterCheckInMutation = undoVoterCheckIn.useMutation();
  return (
    <ElectionManagerNavScreen title="Voters">
      <MainContent>
        <VoterSearch
          renderAction={(voter) =>
            voter.checkIn ? (
              <Button
                style={{ flexWrap: 'nowrap' }}
                icon="Delete"
                color="danger"
                onPress={() => {
                  undoVoterCheckInMutation.mutate({ voterId: voter.voterId });
                }}
              >
                <Font noWrap>Undo Check-In</Font>
              </Button>
            ) : (
              <Row style={{ gap: '0.5rem' }}>
                <Font noWrap>
                  <Icons.X /> Not Checked In
                </Font>
              </Row>
            )
          }
        />
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
        path={electionManagerRoutes.settings.path}
        component={SettingsScreen}
      />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}
