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
import { useState } from 'react';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
  getUser,
} from './api';
import {
  createUnauthenticatedApiClient,
  UnauthenticatedApiClient,
  UnauthenticatedApiClientContext,
} from './public_api';
import { ElectionsScreen } from './elections_screen';
import { electionParamRoutes, routes, resultsRoutes } from './routes';
import { ElectionInfoScreen } from './election_info_screen';
import { GeographyScreen } from './geography_screen';
import { ContestsScreen } from './contests_screen';
import { BallotsScreen } from './ballots_screen';
import { SystemSettingsScreen } from './system_settings_screen';
import { ExportScreen } from './export_screen';
import { ErrorScreen } from './error_screen';
import { ReportingResultsConfirmationScreen } from './reporting_results_confirmation_screen';
import { LiveReportsScreen } from './live_reports_screen';

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
        path={electionParamRoutes.systemSettings.path}
        component={SystemSettingsScreen}
      />
      <Route path={electionParamRoutes.export.path} component={ExportScreen} />
      <Route
        path={electionParamRoutes.reports.root.path}
        component={LiveReportsScreen}
      />
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
  unauthenticatedApiClient = createUnauthenticatedApiClient(),
}: {
  apiClient?: ApiClient;
  unauthenticatedApiClient?: UnauthenticatedApiClient;
}): JSX.Element {
  const [electionsFilterText, setElectionsFilterText] = useState('');
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <ErrorBoundary errorMessage={ErrorScreen}>
        <QueryClientProvider client={createQueryClient()}>
          <BrowserRouter>
            <Switch>
              <Route path={resultsRoutes.root.path} exact>
                <UnauthenticatedApiClientContext.Provider
                  value={unauthenticatedApiClient}
                >
                  <ReportingResultsConfirmationScreen />
                </UnauthenticatedApiClientContext.Provider>
              </Route>
              <ApiClientContext.Provider value={apiClient}>
                <WaitForUserInfo>
                  <Route path={routes.root.path} exact>
                    <ElectionsScreen
                      filterText={electionsFilterText}
                      setFilterText={setElectionsFilterText}
                    />
                  </Route>
                  <Route
                    path={electionParamRoutes.root.path}
                    component={ElectionScreens}
                  />
                </WaitForUserInfo>
              </ApiClientContext.Provider>
            </Switch>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </AppBase>
  );
}
