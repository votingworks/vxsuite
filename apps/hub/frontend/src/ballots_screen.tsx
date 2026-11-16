import { H1, MainContent, TabPanel, RouterTabBar } from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import {
  getBallotsFinalizedAt,
  getBallotLayoutSettings,
  getBallotTemplate,
} from './api.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import {
  type ElectionIdParams,
  electionParamRoutes,
  routes,
} from './routes.js';
import { BallotScreen } from './ballot_screen.js';
import { BallotDesignForm } from './ballot_layout_form.js';
import { BallotStylesTab } from './ballot_styles_table.js';
import { useTitle } from './hooks/use_title.js';

function BallotLayoutTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getBallotLayoutSettingsQuery =
    getBallotLayoutSettings.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);

  if (
    !(
      getBallotLayoutSettingsQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getBallotTemplateQuery.isSuccess
    )
  ) {
    return null;
  }

  const layoutSettings = getBallotLayoutSettingsQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = getBallotTemplateQuery.data;

  return (
    <TabPanel>
      <BallotDesignForm
        electionId={electionId}
        savedLayoutSettings={layoutSettings}
        ballotsFinalizedAt={ballotsFinalizedAt}
        ballotTemplateId={ballotTemplateId}
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
