import React from 'react';
import { H1, LinkButton, Icons, Main, Screen } from '@votingworks/ui';
import { useRouteMatch, Link } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Row } from './layout';
import { electionNavRoutes } from './routes';

const LeftNavBar = styled.nav`
  background: ${({ theme }) => theme.colors.foreground};
  padding: 1rem;
  min-width: 11rem;
  ul {
    list-style: none;
    height: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  li {
    margin-bottom: 0.5rem;
    button {
      width: 100%;
      span {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    }
  }
`;

const NavLinkButton = styled(LinkButton)<{ isActive: boolean }>`
  background: ${({ isActive }) => (isActive ? '' : 'none')};
  color: ${({ theme, isActive }) =>
    isActive ? theme.colors.foreground : theme.colors.background};
`;

function AppLogo(): JSX.Element {
  const theme = useTheme();
  return (
    <H1 style={{ textAlign: 'center' }}>
      <Link
        to="/"
        style={{
          color: theme.colors.background,
          textDecoration: 'none',
        }}
      >
        VxDesign
      </Link>
    </H1>
  );
}

export function NavScreen({
  navContent,
  children,
}: {
  navContent?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Screen>
      <Row style={{ height: '100%' }}>
        <LeftNavBar>
          <AppLogo />
          {navContent}
        </LeftNavBar>
        <Main padded>{children}</Main>
      </Row>
    </Screen>
  );
}

export function ElectionNavScreen({
  electionId,
  children,
}: {
  electionId: string;
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  const theme = useTheme();
  return (
    <NavScreen
      navContent={
        <ul>
          {electionNavRoutes(electionId).map(({ label, path }) => {
            const isActive = path === currentRoute.url;
            return (
              <li key={path}>
                <NavLinkButton to={path} isActive={isActive}>
                  {label}
                  {isActive && <Icons.RightChevron />}
                </NavLinkButton>
              </li>
            );
          })}
          <li
            style={{
              padding: '1rem',
              borderTop: `1px solid ${theme.colors.background}`,
              marginTop: '0.5rem',
              paddingTop: '1.5rem',
            }}
          >
            <Link
              to="/"
              style={{
                color: theme.colors.background,
                textDecoration: 'none',
              }}
            >
              <Icons.LeftChevron /> All Elections
            </Link>
          </li>
        </ul>
      }
    >
      {children}
    </NavScreen>
  );
}
