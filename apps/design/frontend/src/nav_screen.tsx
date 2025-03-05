import React from 'react';
import { ElectionId } from '@votingworks/types';
import {
  AppLogo,
  LeftNav,
  LinkButton,
  Main,
  NavDivider,
  NavListItem,
  NavLink,
  NavList,
  Screen,
} from '@votingworks/ui';
import { Link, useRouteMatch } from 'react-router-dom';
import { electionNavRoutes } from './routes';
import { getUserFeatures } from './api';

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
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;
  return (
    <NavScreen
      navContent={
        <NavList>
          {electionNavRoutes(electionId, features).map(({ title, path }) => (
            <NavListItem key={path}>
              <NavLink to={path} isActive={path === currentRoute.url}>
                {title}
              </NavLink>
            </NavListItem>
          ))}
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
