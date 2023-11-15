import React from 'react';
import { LinkButton, Icons, Main, Screen } from '@votingworks/ui';
import { useRouteMatch, Link } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Row } from './layout';
import { electionNavRoutes } from './routes';

const LeftNavBar = styled.nav`
  background: ${({ theme }) => theme.colors.inverseBackground};
  padding: 1rem;
  min-width: 14rem;

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
  }
`;

const NavLinkButton = styled(LinkButton)`
  width: 100%;
  justify-content: start;
`;

function AppLogo(): JSX.Element {
  const theme = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginTop: '-0.125rem',
        marginBottom: '1rem',
      }}
    >
      <img
        alt="VotingWorks"
        src="/images/logo-circle-white-on-purple.svg"
        style={{ height: '2.5rem' }}
      />
      <Link
        to="/"
        style={{
          fontSize: `${theme.sizes.headingsRem.h2}rem`,
          fontWeight: theme.sizes.fontWeight.bold,
          color: theme.colors.background,
          textDecoration: 'none',
        }}
      >
        VxDesign
      </Link>
    </div>
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
        <Main style={{ position: 'relative' }}>{children}</Main>
      </Row>
    </Screen>
  );
}

const Divider = styled.div`
  border-top: ${({ theme }) => theme.sizes.bordersRem.hairline}rem solid
    ${({ theme }) => theme.colors.outline};
  margin: 0.5rem 0;
`;

export function ElectionNavScreen({
  electionId,
  children,
}: {
  electionId: string;
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  return (
    <NavScreen
      navContent={
        <ul>
          {electionNavRoutes(electionId).map(({ label, path }) => {
            const isActive = path === currentRoute.url;
            return (
              <li key={path}>
                <NavLinkButton
                  to={path}
                  fill={isActive ? 'tinted' : 'transparent'}
                  color="inverseNeutral"
                  rightIcon={
                    isActive ? (
                      <Icons.RightChevron style={{ marginLeft: 'auto' }} />
                    ) : undefined
                  }
                >
                  {label}
                </NavLinkButton>
              </li>
            );
          })}
          <Divider />
          <li>
            <NavLinkButton
              to="/"
              fill="transparent"
              color="inverseNeutral"
              icon="LeftChevron"
            >
              All Elections
            </NavLinkButton>
          </li>
        </ul>
      }
    >
      {children}
    </NavScreen>
  );
}
