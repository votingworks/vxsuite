import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  BallotLayoutForm,
  BallotStylesTable,
} from '@votingworks/election-definition-ui';
import type { ElectionId } from '@votingworks/types';
import { RouterTabBar, TabPanel } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { routerPaths } from '../router_paths.js';
import { getCurrentInProgressElection } from '../api.js';
import { getNavItems } from './nav_items.js';

const BallotStylesPanel = styled.div`
  max-width: 40rem;
`;

function ProofBallotsElectionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
  }

  return (
    <NavigationScreen
      title="Proof Ballots"
      navItems={getNavItems(electionId)}
      backRouterPath={routerPaths.election}
    >
      <RouterTabBar
        tabs={[
          {
            title: 'Ballot Styles',
            path: routerPaths.proofBallotsBallotStyles(electionId),
          },
          {
            title: 'Ballot Layout',
            path: routerPaths.proofBallotsBallotLayout(electionId),
          },
        ]}
      />
      <Switch>
        <Route path={routerPaths.proofBallotsBallotStyles(':electionId')}>
          <TabPanel>
            <BallotStylesPanel>
              <BallotStylesTable electionId={electionId} />
            </BallotStylesPanel>
          </TabPanel>
        </Route>
        <Route path={routerPaths.proofBallotsBallotLayout(':electionId')}>
          <TabPanel>
            <BallotLayoutForm electionId={electionId} />
          </TabPanel>
        </Route>
        <Redirect to={routerPaths.proofBallotsBallotStyles(electionId)} />
      </Switch>
    </NavigationScreen>
  );
}

export function ProofBallotsScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.proofBallots}/:electionId`}>
        <ProofBallotsElectionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
