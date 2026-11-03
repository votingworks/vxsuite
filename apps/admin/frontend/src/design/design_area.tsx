import React, { useMemo } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { Button, P } from '@votingworks/ui';
import {
  BallotScreen,
  ContestsScreen,
  DesignContext,
  type DesignContextValue,
  DistrictsScreen,
  ElectionInfoScreen,
  PartiesScreen,
  PollingPlacesScreen,
  PrecinctsScreen,
  useDesignRoutes,
} from '@votingworks/design-ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { ADMIN_DESIGN_SHELL } from './admin_design_shell.js';
import {
  asDesignUiApiClient,
  createAdminDesignApiClient,
  getDesignStatus,
  saveProofToUsb,
} from './design_api.js';
import { DesignBallotsScreen } from './design_ballots_screen.js';
import { DesignElectionsScreen } from './design_elections_screen.js';

export const DESIGN_BASE_PATH = '/design';

function DesignElectionScreens(): JSX.Element {
  const electionParamRoutes = useDesignRoutes().election(':electionId');
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

function DesignStatusGate({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element | null {
  const statusQuery = getDesignStatus.useQuery();
  if (statusQuery.isLoading) return null;
  if (statusQuery.isError) {
    return (
      <NavigationScreen title="Election Design">
        <P>
          Election design is unavailable because its database could not be
          reached. The rest of VxAdmin is unaffected.
        </P>
        <Button
          onPress={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching}
        >
          Try Again
        </Button>
      </NavigationScreen>
    );
  }
  if (statusQuery.data?.status === 'unsupported-state') {
    return (
      <NavigationScreen title="Election Design">
        <P>
          Election design is not available for this machine&apos;s jurisdiction
          ({statusQuery.data.jurisdiction}). No state profile is configured for
          it.
        </P>
      </NavigationScreen>
    );
  }
  return <React.Fragment>{children}</React.Fragment>;
}

function DesignRoutes(): JSX.Element {
  const routes = useDesignRoutes();
  return (
    <Switch>
      <Route exact path={routes.root.path}>
        <DesignElectionsScreen />
      </Route>
      <Route
        path={routes.election(':electionId').root.path}
        component={DesignElectionScreens}
      />
    </Switch>
  );
}

export function DesignArea(): JSX.Element {
  const designContext = useMemo((): DesignContextValue => {
    const adminDesignApiClient = createAdminDesignApiClient();
    return {
      ...ADMIN_DESIGN_SHELL,
      apiClient: asDesignUiApiClient(adminDesignApiClient),
      basePath: DESIGN_BASE_PATH,
      saveFile: (data, fileName) =>
        saveProofToUsb(adminDesignApiClient, data, fileName),
    };
  }, []);
  return (
    <DesignContext.Provider value={designContext}>
      <DesignStatusGate>
        <DesignRoutes />
      </DesignStatusGate>
    </DesignContext.Provider>
  );
}
