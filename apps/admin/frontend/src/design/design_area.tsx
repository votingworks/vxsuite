import React, { useState } from 'react';
import { Button, P } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  ApiClientContext,
  BallotScreen,
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
  AdminQueryClientContext,
  asDesignUiApiClient,
  createAdminDesignApiClient,
  getDesignAvailability,
} from './design_api.js';
import { DesignBallotsScreen } from './design_ballots_screen.js';
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
      <Route
        path={
          electionParamRoutes.ballots.viewBallot(
            ':ballotStyleId',
            ':precinctId'
          ).path
        }
        component={BallotScreen}
      />
      <Route
        path={electionParamRoutes.ballots.root.path}
        component={DesignBallotsScreen}
      />
      <Redirect
        from={electionParamRoutes.root.path}
        to={electionParamRoutes.electionInfo.root.path}
      />
    </Switch>
  );
}

function DesignAvailabilityGate({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element | null {
  const availabilityQuery = getDesignAvailability.useQuery();
  if (availabilityQuery.isLoading) return null;
  if (availabilityQuery.isError) {
    return (
      <NavigationScreen title="Election Design">
        <P>
          Election design is unavailable because its database could not be
          reached. The rest of VxAdmin is unaffected.
        </P>
        <Button
          onPress={() => availabilityQuery.refetch()}
          disabled={availabilityQuery.isFetching}
        >
          Try Again
        </Button>
      </NavigationScreen>
    );
  }
  return <React.Fragment>{children}</React.Fragment>;
}

export function DesignArea(): JSX.Element {
  const adminQueryClient = useQueryClient();
  const [queryClient] = useState(createQueryClient);
  const [apiClient] = useState(() =>
    asDesignUiApiClient(createAdminDesignApiClient())
  );
  return (
    <AdminQueryClientContext.Provider value={adminQueryClient}>
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
    </AdminQueryClientContext.Provider>
  );
}
