import './polyfills';
import {
  AppBase,
  ErrorBoundary,
  LoadingAnimation,
  Main,
  Screen,
} from '@votingworks/ui';
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
  getUser,
} from './api';
import { ElectionsScreen } from './elections_screen';
import { electionParamRoutes, routes } from './routes';
import { ElectionInfoScreen } from './election_info_screen';
import { GeographyScreen } from './geography_screen';
import { ContestsScreen } from './contests_screen';
import { BallotsScreen } from './ballots_screen';
import { BallotOrderInfoScreen } from './ballot_order_info_screen';
import { SystemSettingsScreen } from './system_settings_screen';
import { ExportScreen } from './export_screen';
import { ErrorScreen } from './error_screen';

function ElectionScreens(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionParamRoutes.electionInfo.path}
        component={ElectionInfoScreen}
      />
      <Route
        path={electionParamRoutes.geography.root.path}
        component={GeographyScreen}
      />
      <Route
        path={electionParamRoutes.contests.root.path}
        component={ContestsScreen}
      />
      <Route
        path={electionParamRoutes.ballots.root.path}
        component={BallotsScreen}
      />
      <Route
        path={electionParamRoutes.ballotOrderInfo.path}
        component={BallotOrderInfoScreen}
      />
      <Route
        path={electionParamRoutes.systemSettings.path}
        component={SystemSettingsScreen}
      />
      <Route path={electionParamRoutes.export.path} component={ExportScreen} />
      <Redirect
        from={electionParamRoutes.root.path}
        to={electionParamRoutes.electionInfo.path}
      />
    </Switch>
  );
}

function WaitForUserInfo(props: { children: React.ReactNode }) {
  const { children } = props;

  const userLoaded = getUser.useQuery().isSuccess;
  if (!userLoaded) {
    return (
      <Screen>
        <Main centerChild>
          <LoadingAnimation />
        </Main>
      </Screen>
    );
  }

  return children;
}

export function App({
  apiClient = createApiClient(),
}: {
  apiClient?: ApiClient;
}): JSX.Element {
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <ErrorBoundary errorMessage={ErrorScreen}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={createQueryClient()}>
            <WaitForUserInfo>
              <BrowserRouter>
                <Switch>
                  <Route
                    path={routes.root.path}
                    exact
                    component={ElectionsScreen}
                  />
                  <Route
                    path={electionParamRoutes.root.path}
                    component={ElectionScreens}
                  />
                </Switch>
              </BrowserRouter>
            </WaitForUserInfo>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </AppBase>
  );
}
