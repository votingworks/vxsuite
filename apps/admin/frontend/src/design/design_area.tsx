import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  ApiClientContext,
  ContestsScreen,
  createQueryClient,
  DesignShellContext,
  DistrictsScreen,
  ElectionInfoScreen,
  electionParamRoutes,
  PartiesScreen,
  PollingPlacesScreen,
  PrecinctsScreen,
  routes,
  setRoutesBasePath,
} from '@votingworks/design-ui';
import { ADMIN_DESIGN_SHELL } from './admin_design_shell.js';
import {
  asDesignUiApiClient,
  createAdminDesignApiClient,
} from './design_api.js';
import { DesignElectionsScreen } from './design_elections_screen.js';

export const DESIGN_BASE_PATH = '/design';

setRoutesBasePath(DESIGN_BASE_PATH);

function DesignElectionScreens(): JSX.Element {
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
        path={electionParamRoutes.pollingPlaces.root.path}
        component={PollingPlacesScreen}
      />
      <Route
        path={electionParamRoutes.parties.root.path}
        component={PartiesScreen}
      />
      <Route
        path={electionParamRoutes.contests.root.path}
        component={ContestsScreen}
      />
      <Redirect
        from={electionParamRoutes.root.path}
        to={electionParamRoutes.electionInfo.root.path}
      />
    </Switch>
  );
}

export function DesignArea(): JSX.Element {
  const [queryClient] = useState(createQueryClient);
  const [apiClient] = useState(() =>
    asDesignUiApiClient(createAdminDesignApiClient())
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={apiClient}>
        <DesignShellContext.Provider value={ADMIN_DESIGN_SHELL}>
          <Switch>
            <Route exact path={routes.root.path}>
              <DesignElectionsScreen />
            </Route>
            <Route
              path={electionParamRoutes.root.path}
              component={DesignElectionScreens}
            />
          </Switch>
        </DesignShellContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>
  );
}
