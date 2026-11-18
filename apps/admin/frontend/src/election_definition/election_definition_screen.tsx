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
  ElectionInfoEditor,
  PartiesEditor,
  PollingPlacesEditor,
  PrecinctsEditor,
} from '@votingworks/election-definition-ui';
import type { ElectionId } from '@votingworks/types';
import { DesktopPalette, RouterTabBar } from '@votingworks/ui';
import { NavScreenLite } from '../components/navigation_screen.js';
import { routerPaths } from '../router_paths.js';
import {
  electionDefinitionApi,
  getCurrentInProgressElection,
  getElectionPackageRenderingStatus,
} from '../api.js';
import { getNavItems } from './nav_items.js';

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

  > button {
    min-width: 0;
  }
`;

function DefinitionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
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
  const getElectionPackageQuery =
    getElectionPackageRenderingStatus.usePollingQuery(electionId);
  const infoPath = routerPaths.electionDefinitionInfo(electionId);
  const districtsPath = routerPaths.electionDefinitionDistricts(electionId);
  const precinctsPath = routerPaths.electionDefinitionPrecincts(electionId);
  const pollingPlacesPath =
    routerPaths.electionDefinitionPollingPlaces(electionId);
  const partiesPath = routerPaths.electionDefinitionParties(electionId);
  const contestsPath = routerPaths.electionDefinitionContests(electionId);

  if (!getStateFeaturesQuery.isSuccess || !getElectionPackageQuery.isSuccess) {
    return null;
  }
  const electionPackage = getElectionPackageQuery.data;
  const isLocked = !!electionPackage && electionPackage.status !== 'failed';
  const canEditPollingPlaces = !!getStateFeaturesQuery.data.EDIT_POLLING_PLACES;

  return (
    <NavScreenLite
      navItems={getNavItems(electionId, electionPackage)}
      backRouterPath={routerPaths.election}
    >
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
              isLocked={isLocked}
              isDeleteDisabled={isLocked}
              onElectionDeleted={() => history.push(routerPaths.election)}
            />
          </Route>
          <Route path={routerPaths.electionDefinitionDistricts(':electionId')}>
            <DistrictsEditor electionId={electionId} isLocked={isLocked} />
          </Route>
          <Route path={routerPaths.electionDefinitionPrecincts(':electionId')}>
            <PrecinctsEditor electionId={electionId} isLocked={isLocked} />
          </Route>
          {canEditPollingPlaces && (
            <Route
              path={routerPaths.electionDefinitionPollingPlaces(':electionId')}
            >
              <PollingPlacesEditor
                electionId={electionId}
                isLocked={isLocked}
              />
            </Route>
          )}
          <Route path={routerPaths.electionDefinitionParties(':electionId')}>
            <PartiesEditor electionId={electionId} isLocked={isLocked} />
          </Route>
          <Route path={routerPaths.electionDefinitionContests(':electionId')}>
            <ContestsEditor electionId={electionId} isLocked={isLocked} />
          </Route>
          <Redirect to={infoPath} />
        </Switch>
      </Container>
    </NavScreenLite>
  );
}

export function ElectionDefinitionScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.electionDefinition}/:electionId`}>
        <DefinitionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
