import React from 'react';
import { ElectionId } from '@votingworks/types';
import {
  AppLogo,
  LeftNav as LeftNavBase,
  LinkButton,
  Main,
  NavDivider,
  NavListItem,
  NavLink,
  NavList,
  Screen,
  Icons,
  MainHeader,
  Button,
  LogoContainer,
} from '@votingworks/ui';
import { Link, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components';
import { adminElectionNavRoutes, electionNavRoutes } from './routes';
import {
  getElectionInfo,
  getSystemSettings,
  getUser,
  getUserFeatures,
} from './api';
import { Row } from './layout';

const UserInfo = styled.div`
  display: flex;
  gap: 0.5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const LeftNav = styled(LeftNavBase)`
  ${LogoContainer} {
    /*
     * Adjusted up from the libs/ui default to match <MainHeader> adjustment
     * below and keep logo roughly in line with page titles.
     */
    margin-top: -0.25rem;
  }
`;

function UserInfoAndLogoutButton(): JSX.Element | null {
  const getUserQuery = getUser.useQuery();
  if (!getUserQuery.isSuccess) return null;
  const user = getUserQuery.data;
  return (
    <Row style={{ alignItems: 'center', gap: '1rem' }}>
      <UserInfo>
        <Icons.CircleUser />
        {user.name}
      </UserInfo>
      <Button
        icon="LogOut"
        onPress={() => {
          window.location.assign('/auth/logout');
        }}
      >
        Log Out
      </Button>
    </Row>
  );
}

export function Header({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <MainHeader
      className={className}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
      }}
    >
      <div style={{ alignSelf: 'center' }}>{children}</div>
      {/* Anchor the user info to the top of the page so it doesn't jump around
      if different pages have different title heights (e.g. when using
      breadcrumbs) */}
      <div style={{ alignSelf: 'start' }}>
        <UserInfoAndLogoutButton />
      </div>
    </MainHeader>
  );
}

export function NavScreen({
  navContent,
  children,
}: {
  navContent?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <LeftNav style={{ width: '14rem' }}>
        <Link to="/">
          <AppLogo appName="VxDesign" />
        </Link>
        {navContent}
      </LeftNav>
      <Main flexColumn>{children}</Main>
    </Screen>
  );
}

export function ElectionNavScreen({
  electionId,
  children,
}: {
  electionId: ElectionId;
  children: React.ReactNode;
}): JSX.Element | null {
  const currentRoute = useRouteMatch();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  if (
    !getElectionInfoQuery.isSuccess ||
    !getUserFeaturesQuery.isSuccess ||
    !getSystemSettingsQuery.isSuccess
  ) {
    return null;
  }
  const electionInfo = getElectionInfoQuery.data;
  const systemSettings = getSystemSettingsQuery.data;
  const userFeatures = getUserFeaturesQuery.data;
  return (
    <NavScreen
      navContent={
        <NavList>
          {electionNavRoutes(electionInfo, systemSettings).map(
            ({ path, title }) => (
              <NavListItem key={path}>
                <NavLink to={path} isActive={path === currentRoute.url}>
                  {title}
                </NavLink>
              </NavListItem>
            )
          )}
          {adminElectionNavRoutes(electionInfo, userFeatures).length > 0 && (
            <NavDivider />
          )}
          {adminElectionNavRoutes(electionInfo, userFeatures).map(
            ({ path, title }) => (
              <NavListItem key={path}>
                <NavLink to={path} isActive={path === currentRoute.url}>
                  {title}
                </NavLink>
              </NavListItem>
            )
          )}
          <NavDivider />
          <NavListItem>
            <LinkButton
              to="/"
              fill="transparent"
              color="inverseNeutral"
              icon="ChevronLeft"
            >
              All Elections
            </LinkButton>
          </NavListItem>
        </NavList>
      }
    >
      {children}
    </NavScreen>
  );
}
