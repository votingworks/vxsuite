import {
  Button,
  Card,
  H1,
  H2,
  MainContent,
  P,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Header, NavScreen } from './nav_screen';
import { getElection, logOut, unconfigure } from './api';
import { Column } from './layout';

export function ElectionManagerScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery();
  assert(getElectionQuery.isSuccess);
  const election = getElectionQuery.data.unsafeUnwrap();

  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();

  return (
    <NavScreen>
      <Header>
        <H1>Election Manager Settings</H1>
        <Button icon="Lock" onPress={() => logOutMutation.mutate()}>
          Lock Machine
        </Button>
      </Header>
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
    </NavScreen>
  );
}
