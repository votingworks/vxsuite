import React from 'react';
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
import { useRouteMatch } from 'react-router-dom';
import { electionNavRoutes } from './routes';

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
        <AppLogo appName="VxDesign" />
        {navContent}
      </LeftNav>
      <Main>{children}</Main>
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
  return (
    <NavScreen
      navContent={
        <NavList>
          {electionNavRoutes(electionId).map(({ title, path }) => {
            return (
              <NavListItem key={path}>
                <NavLink to={path} isActive={path === currentRoute.url}>
                  {title}
                </NavLink>
              </NavListItem>
            );
          })}
          <NavDivider />
          <NavListItem>
            <LinkButton
              to="/"
              fill="transparent"
              color="inverseNeutral"
              icon="LeftChevron"
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
