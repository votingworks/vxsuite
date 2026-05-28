import React from 'react';
import { Link, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components';
import {
  AppLogo,
  LeftNav,
  NavLink,
  NavList,
  NavListItem,
  VerticalElectionInfoBar,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';

export interface SidebarProps {
  navItems: readonly NavItem[];
}

export interface NavItem {
  label: React.ReactNode;
  routerPath: string;
  flag?: BooleanEnvironmentVariableName;
}

// `&&` doubles the class selector so this overrides the broader
// `LogoContainer span { font-size, font-weight }` rule in libs/ui/left_nav.tsx,
// which would otherwise win on specificity (class + element vs. class).
const ClientLogoSubtitle = styled.span`
  && {
    display: block;
    font-size: 0.75rem;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    line-height: 1;
  }
`;

export function Sidebar(props: SidebarProps): JSX.Element {
  const { navItems } = props;
  const currentRoute = useRouteMatch();

  const {
    electionDefinition,
    electionPackageHash,
    machineConfig,
    machineMode,
  } = React.useContext(AppContext);

  function isActivePath(path: string): boolean {
    return currentRoute.path.startsWith(path);
  }

  const appName =
    machineMode === 'client' ? (
      <React.Fragment>
        VxAdmin
        <ClientLogoSubtitle>Adjudication Station</ClientLogoSubtitle>
      </React.Fragment>
    ) : (
      'VxAdmin'
    );

  return (
    <LeftNav>
      <Link to="/">
        <AppLogo appName={appName} />
      </Link>
      <NavList>
        {navItems
          .filter(({ flag }) => !flag || isFeatureFlagEnabled(flag))
          .map(({ label, routerPath }) => (
            <NavListItem key={routerPath}>
              <NavLink to={routerPath} isActive={isActivePath(routerPath)}>
                {label}
              </NavLink>
            </NavListItem>
          ))}
      </NavList>
      <div style={{ marginTop: 'auto' }}>
        <VerticalElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          inverse
        />
      </div>
    </LeftNav>
  );
}
