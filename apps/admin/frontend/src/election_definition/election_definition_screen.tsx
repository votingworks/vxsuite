import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import styled from 'styled-components';
import {
  ContestsEditor,
  DistrictsEditor,
  ElectionDefinitionContextProvider,
  ElectionInfoEditor,
  PartiesEditor,
  PollingPlacesEditor,
  PrecinctsEditor,
} from '@votingworks/election-definition-ui';
import type { ElectionId } from '@votingworks/types';
import { DesktopPalette, RouterTabBar } from '@votingworks/ui';
import { NavScreenLite } from '../components/navigation_screen.js';
import type { NavItem } from '../components/sidebar.js';
import { routerPaths } from '../router_paths.js';
import { electionDefinitionApi, getCurrentInProgressElection } from '../api.js';
import { reportUnexpectedError } from '../logger.js';

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Definition', routerPath: routerPaths.electionDefinition },
];

const Container = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  height: 100%;
  overflow-y: hidden;
`;

const TabBar = styled(RouterTabBar)`
  border-color: ${DesktopPalette.Gray30};
  gap: 1rem;
  padding: 1rem 1rem 0;
`;

function DefinitionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.electionDefinition} />;
  }

  return <DefinitionTabs electionId={electionId} />;
}

function DefinitionTabs({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const history = useHistory();
  const getStateFeaturesQuery =
    electionDefinitionApi.getStateFeatures.useQuery(electionId);
  const infoPath = routerPaths.electionDefinitionInfo(electionId);
  const districtsPath = routerPaths.electionDefinitionDistricts(electionId);
  const precinctsPath = routerPaths.electionDefinitionPrecincts(electionId);
  const pollingPlacesPath =
    routerPaths.electionDefinitionPollingPlaces(electionId);
  const partiesPath = routerPaths.electionDefinitionParties(electionId);
  const contestsPath = routerPaths.electionDefinitionContests(electionId);

  if (!getStateFeaturesQuery.isSuccess) {
    return null;
  }
  const canEditPollingPlaces = !!getStateFeaturesQuery.data.EDIT_POLLING_PLACES;

  return (
    <NavScreenLite navItems={NAV_ITEMS} backRouterPath={routerPaths.election}>
      <Container>
        <TabBar
          tabs={[
            { title: 'Election Info', path: infoPath },
            { title: 'Districts', path: districtsPath },
            { title: 'Precincts', path: precinctsPath },
            ...(canEditPollingPlaces
              ? [{ title: 'Polling Places', path: pollingPlacesPath }]
              : []),
            { title: 'Parties', path: partiesPath },
            { title: 'Contests', path: contestsPath },
          ]}
        />
        <Switch>
          <Route exact path={routerPaths.electionDefinitionInfo(':electionId')}>
            <ElectionInfoEditor
              electionId={electionId}
              onElectionDeleted={() => history.push(routerPaths.election)}
            />
          </Route>
          <Route path={routerPaths.electionDefinitionDistricts(':electionId')}>
            <DistrictsEditor electionId={electionId} />
          </Route>
          <Route path={routerPaths.electionDefinitionPrecincts(':electionId')}>
            <PrecinctsEditor electionId={electionId} />
          </Route>
          {canEditPollingPlaces && (
            <Route
              path={routerPaths.electionDefinitionPollingPlaces(':electionId')}
            >
              <PollingPlacesEditor electionId={electionId} />
            </Route>
          )}
          <Route path={routerPaths.electionDefinitionParties(':electionId')}>
            <PartiesEditor electionId={electionId} />
          </Route>
          <Route path={routerPaths.electionDefinitionContests(':electionId')}>
            <ContestsEditor electionId={electionId} />
          </Route>
          <Redirect to={infoPath} />
        </Switch>
      </Container>
    </NavScreenLite>
  );
}

function CurrentInProgressElectionRedirect(): JSX.Element | null {
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  const currentElection = getCurrentInProgressElectionQuery.data;
  return (
    <Redirect
      to={
        currentElection
          ? routerPaths.electionDefinitionInfo(currentElection.electionId)
          : routerPaths.election
      }
    />
  );
}

export function ElectionDefinitionScreen(): JSX.Element {
  return (
    <ElectionDefinitionContextProvider
      api={electionDefinitionApi}
      reportUnexpectedError={reportUnexpectedError}
    >
      <Switch>
        <Route exact path={routerPaths.electionDefinition}>
          <CurrentInProgressElectionRedirect />
        </Route>
        <Route path={`${routerPaths.electionDefinition}/:electionId`}>
          <DefinitionScreen />
        </Route>
      </Switch>
    </ElectionDefinitionContextProvider>
  );
}
