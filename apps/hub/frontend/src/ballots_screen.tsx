import { H1, MainContent, TabPanel, RouterTabBar } from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import {
  BallotLayoutForm,
  BallotStylesTable,
  Column,
} from '@votingworks/election-definition-ui';
import { getBallotsFinalizedAt, getBallotTemplate } from './api.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import {
  type ElectionIdParams,
  electionParamRoutes,
  routes,
} from './routes.js';
import { BallotScreen } from './ballot_screen.js';
import { useTitle } from './hooks/use_title.js';
import { BallotsStatus } from './ballots_status.js';

function BallotStylesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (!getBallotsFinalizedAtQuery.isSuccess) {
    return null;
  }

  return (
    <TabPanel>
      <Column style={{ gap: '1rem', maxWidth: '40rem' }}>
        <BallotsStatus />
        <BallotStylesTable
          electionId={electionId}
          getViewBallotPath={(ballotStyleId, precinctId) =>
            routes
              .election(electionId)
              .ballots.viewBallot(ballotStyleId, precinctId).path
          }
        />
      </Column>
    </TabPanel>
  );
}

function BallotLayoutTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);

  if (
    !(getBallotsFinalizedAtQuery.isSuccess && getBallotTemplateQuery.isSuccess)
  ) {
    return null;
  }

  const ballotTemplateId = getBallotTemplateQuery.data;

  return (
    <TabPanel>
      <BallotLayoutForm
        electionId={electionId}
        isLocked={!!getBallotsFinalizedAtQuery.data}
        hideDensity={
          ballotTemplateId === 'MiBallot' ||
          ballotTemplateId === 'NhStateBallot'
        }
      />
    </TabPanel>
  );
}

export function BallotsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const ballotsParamRoutes = electionParamRoutes.ballots;
  const ballotsRoutes = routes.election(electionId).ballots;
  useTitle(routes.election(electionId).ballots.root.title);

  return (
    <Switch>
      <Route
        path={
          ballotsParamRoutes.viewBallot(':ballotStyleId', ':precinctId').path
        }
        exact
        component={BallotScreen}
      />
      <Route path={ballotsParamRoutes.root.path}>
        <ElectionNavScreen electionId={electionId}>
          <Header>
            <H1>Proof Ballots</H1>
          </Header>
          <MainContent>
            <RouterTabBar
              tabs={[ballotsRoutes.ballotStyles, ballotsRoutes.ballotLayout]}
            />
            <Switch>
              <Route
                path={ballotsParamRoutes.ballotStyles.path}
                component={BallotStylesTab}
              />
              <Route
                path={ballotsParamRoutes.ballotLayout.path}
                component={BallotLayoutTab}
              />
              <Redirect
                from={ballotsParamRoutes.root.path}
                to={ballotsParamRoutes.ballotStyles.path}
              />
            </Switch>
          </MainContent>
        </ElectionNavScreen>
      </Route>
    </Switch>
  );
}
