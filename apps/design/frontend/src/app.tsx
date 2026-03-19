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
} from './api.js';
import {
  createUnauthenticatedApiClient,
  UnauthenticatedApiClient,
  UnauthenticatedApiClientContext,
} from './public_api.js';
import { electionParamRoutes, routes, resultsRoutes } from './routes.js';
import { ElectionInfoScreen } from './election_info_screen.js';
import { ContestsScreen } from './contests_screen.js';
import { BallotsScreen } from './ballots_screen.js';
import { SystemSettingsScreen } from './system_settings_screen.js';
import { ExportScreen } from './export_screen.js';
import { ErrorScreen } from './error_screen.js';
import { ReportingResultsConfirmationScreen } from './reporting_results_confirmation_screen.js';
import { LiveReportsScreen } from './live_reports_screen.js';
import { ConvertResultsScreen } from './convert_results_screen.js';
import { PartiesScreen } from './parties_screen.js';
import { DistrictsScreen } from './districts_screen.js';
import { PrecinctsScreen } from './precincts_screen.js';
import { HomeScreen } from './home_screen.js';
import { DownloadsScreen } from './downloads_screen.js';

function ElectionScreens(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionParamRoutes.electionInfo.root.path}
        component={ElectionInfoScreen}
      />
      <Route
        path={electionParamRoutes.districts.root.path}
        component={DistrictsScreen}
      />
      <Route
        path={electionParamRoutes.precincts.root.path}
        component={PrecinctsScreen}
      />
      <Route
        path={electionParamRoutes.parties.root.path}
        component={PartiesScreen}
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
        path={electionParamRoutes.downloads.path}
        component={DownloadsScreen}
      />
      <Route
        path={electionParamRoutes.reports.root.path}
        component={LiveReportsScreen}
      />
      <Route
        path={electionParamRoutes.convertResults.path}
        component={ConvertResultsScreen}
      />
      <Redirect
        from={electionParamRoutes.root.path}
        to={electionParamRoutes.electionInfo.root.path}
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
                    <HomeScreen
                      electionsFilterText={electionsFilterText}
                      setElectionsFilterText={setElectionsFilterText}
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
