import { ElectionDefinition } from '@votingworks/types';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import {
  Screen,
  LeftNav,
  NavList,
  NavListItem,
  NavLink,
  VerticalElectionInfoBar,
  Main,
  Button,
  P,
} from '@votingworks/ui';
import { TopBar } from '../components/top_bar';
import { unconfigureMachine } from '../api';

export const systemAdministratorRoutes = {
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function SystemAdministratorWrapper({
  children,
  electionDefinition,
  title,
  centerChild = false,
}: {
  children: React.ReactNode;
  electionDefinition: ElectionDefinition | null;
  title: string;
  centerChild?: boolean;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  return (
    <Screen flexDirection="row">
      <LeftNav>
        <NavList>
          {Object.values(systemAdministratorRoutes).map((route) => (
            <NavListItem key={route.path}>
              <NavLink
                to={route.path}
                isActive={route.path === currentRoute.url}
              >
                {route.title}
              </NavLink>
            </NavListItem>
          ))}
        </NavList>
        <div style={{ marginTop: 'auto' }}>
          <VerticalElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition || undefined}
            electionPackageHash="TBD"
            codeVersion="TBD"
            machineId="TBD"
            inverse
          />
        </div>
      </LeftNav>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <TopBar title={title} />
        <Main centerChild={centerChild}>{children}</Main>
      </div>
    </Screen>
  );
}

interface SystemAdministratorSettingsScreenProps
  extends SystemAdministratorScreenProps {}

function SystemAdministratorSettingsScreen({
  electionDefinition,
}: SystemAdministratorSettingsScreenProps): JSX.Element | null {
  const unconfigureMachineMutation = unconfigureMachine.useMutation();

  return (
    <SystemAdministratorWrapper
      electionDefinition={electionDefinition}
      title="Settings"
    >
      {electionDefinition ? (
        <Button onPress={unconfigureMachineMutation.mutate}>Unconfigure</Button>
      ) : (
        <P>No election configured</P>
      )}
    </SystemAdministratorWrapper>
  );
}

export interface SystemAdministratorScreenProps {
  electionDefinition: ElectionDefinition | null;
}

export function SystemAdministratorScreen({
  electionDefinition,
}: SystemAdministratorScreenProps): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.settings.path}
        render={() => (
          <SystemAdministratorSettingsScreen
            electionDefinition={electionDefinition}
          />
        )}
      />
      <Redirect to={systemAdministratorRoutes.settings.path} />
    </Switch>
  );
}
