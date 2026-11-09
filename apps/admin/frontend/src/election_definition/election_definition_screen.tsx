import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import styled from 'styled-components';
import {
  ElectionDefinitionContextProvider,
  ElectionInfoEditor,
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
  const history = useHistory();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();
  const infoPath = routerPaths.electionDefinitionInfo(electionId);

  if (!getCurrentInProgressElectionQuery.isSuccess) {
    return null;
  }
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.electionDefinition} />;
  }

  return (
    <NavScreenLite navItems={NAV_ITEMS} backRouterPath={routerPaths.election}>
      <Container>
        <TabBar tabs={[{ title: 'Election Info', path: infoPath }]} />
        <Switch>
          <Route exact path={routerPaths.electionDefinitionInfo(':electionId')}>
            <ElectionInfoEditor
              electionId={electionId}
              onElectionDeleted={() => history.push(routerPaths.election)}
            />
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
