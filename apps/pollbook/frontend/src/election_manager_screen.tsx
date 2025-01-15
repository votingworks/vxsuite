import {
  Button,
  Card,
  Font,
  H1,
  H2,
  Icons,
  MainContent,
  NavLink,
  NavList,
  NavListItem,
  P,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import React, { useMemo, useState } from 'react';
import type { VoterSearchParams } from '@votingworks/pollbook-backend';
import debounce from 'lodash.debounce';
import { Header, NavScreen } from './nav_screen';
import {
  getElection,
  logOut,
  searchVoters,
  unconfigure,
  undoVoterCheckIn,
} from './api';
import { Column, Row } from './layout';
import { VoterSearch } from './voter_search_screen';

const routes = {
  election: { title: 'Election', path: '/election' },
  voters: { title: 'Voters', path: '/voters' },
} satisfies Record<string, { title: string; path: string }>;

function ElectionManagerNavScreen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  const logOutMutation = logOut.useMutation();

  return (
    <NavScreen
      navContent={
        <NavList>
          {Object.values(routes).map(({ title, path }) => (
            <NavListItem key={path}>
              <NavLink to={path} isActive={path === currentRoute.url}>
                {title}
              </NavLink>
            </NavListItem>
          ))}
        </NavList>
      }
    >
      <Header>
        <H1>{title}</H1>
        <Button icon="Lock" onPress={() => logOutMutation.mutate()}>
          Lock Machine
        </Button>
      </Header>
      {children}
    </NavScreen>
  );
}

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
                <Icons.X /> Not Checked In
              </Row>
            )
          }
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

export function ElectionManagerScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={routes.election.path} component={ElectionScreen} />
      <Route path={routes.voters.path} component={VotersScreen} />
      <Redirect to={routes.election.path} />
    </Switch>
  );
}
