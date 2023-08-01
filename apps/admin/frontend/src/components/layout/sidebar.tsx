import React from 'react';
import { useRouteMatch } from 'react-router-dom';
import styled from 'styled-components';

import { Icons, LinkButton, VerticalElectionInfoBar } from '@votingworks/ui';

import { AppContext } from '../../contexts/app_context';
import { SIDEBAR_WIDTH_REM } from './constants';

export interface SidebarProps {
  navItems: readonly NavItem[];
}

export interface NavItem {
  label: React.ReactNode;
  routerPath: string;
}

const Container = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem 0.25rem;
  width: ${SIDEBAR_WIDTH_REM}rem;
`;

const Nav = styled.nav`
  align-items: stretch;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: auto;
`;

const NavList = styled.ul`
  align-items: stretch;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const NavListItem = styled.li`
  display: flex;
  list-style: none;
`;

const NavButton = styled(LinkButton)`
  display: flex;
  flex-grow: 1;
  padding: 0.75rem;
  text-align: left;
`;

const NavButtonLabel = styled.span`
  align-items: center;
  display: flex;
  flex-grow: 1;
  justify-content: space-between;
`;

interface NavActiveIconProps {
  active?: boolean;
}

const NavActiveIcon = styled.span<NavActiveIconProps>`
  opacity: ${(p) => (p.active ? 1 : 0)};
  transition: opacity 100ms ease-out;
`;

const SystemInfo = styled.div`
  align-items: stretch;
  display: flex;
  flex-direction: column;
  flex-shrink: 1;
  overflow: auto;
`;

export function Sidebar(props: SidebarProps): JSX.Element {
  const { navItems } = props;
  const currentRoute = useRouteMatch();

  const { electionDefinition, machineConfig } = React.useContext(AppContext);

  function isActivePath(path: string): boolean {
    return currentRoute.path.startsWith(path);
  }

  return (
    <Container>
      <Nav>
        <NavList>
          {navItems.map(({ label, routerPath }) => (
            <NavListItem key={routerPath}>
              <NavButton
                to={routerPath}
                variant={isActivePath(routerPath) ? 'primary' : 'regular'}
              >
                <NavButtonLabel>
                  <span>{label}</span>
                  <NavActiveIcon active={isActivePath(routerPath)}>
                    <Icons.RightChevron />
                  </NavActiveIcon>
                </NavButtonLabel>
              </NavButton>
            </NavListItem>
          ))}
        </NavList>
      </Nav>
      {electionDefinition && (
        <SystemInfo>
          <VerticalElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
          />
        </SystemInfo>
      )}
    </Container>
  );
}
