import type React from 'react';
import type { ElectionId } from '@votingworks/types';
import {
  AppLogo,
  Caption,
  LeftNav,
  Main,
  MainHeader,
  NavDivider,
  NavLink,
  NavList,
  NavListItem,
  Screen,
} from '@votingworks/ui';
import {
  type DesignContextValue,
  getElectionInfo,
  getStateFeatures,
  useDesignRoutes,
} from '@votingworks/design-ui';
import { useRouteMatch } from 'react-router-dom';
import { type CurrentDesign, getCurrentDesign } from './design_api.js';

function designStageLabel(design: CurrentDesign | null): string {
  if (!design) return '';
  if (design.activated) return 'Activated (read-only)';
  if (design.ballotsFinalizedAt) return 'Finalized';
  return 'Designing';
}

function DesignElectionNavScreen({
  electionId,
  children,
}: {
  electionId: ElectionId;
  children: React.ReactNode;
}): JSX.Element | null {
  const currentRoute = useRouteMatch();
  const routes = useDesignRoutes();
  const currentDesignQuery = getCurrentDesign.useQuery();
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const getStateFeaturesQuery = getStateFeatures.useQuery(electionId);
  if (
    !getElectionInfoQuery.isSuccess ||
    !getStateFeaturesQuery.isSuccess ||
    !currentDesignQuery.isSuccess
  ) {
    return null;
  }
  const currentDesign = currentDesignQuery.data;
  const r = routes.election(electionId);
  const navRoutes = [
    r.electionInfo.root,
    r.districts.root,
    r.precincts.root,
    getStateFeaturesQuery.data.EDIT_POLLING_PLACES && r.pollingPlaces.root,
    r.parties.root,
    r.contests.root,
    { title: 'Ballots', path: r.ballots.root.path },
  ].filter((route) => !!route);

  return (
    <Screen flexDirection="row">
      <LeftNav style={{ width: '14rem' }}>
        <AppLogo appName="VxAdmin" />
        <Caption style={{ padding: '0 1rem' }}>
          {designStageLabel(currentDesign)}
        </Caption>
        <NavList>
          {navRoutes.map(({ path, title }) => (
            <NavListItem key={path}>
              <NavLink to={path} isActive={path === currentRoute.url}>
                {title}
              </NavLink>
            </NavListItem>
          ))}
          <NavDivider />
          <NavListItem>
            <NavLink to="/" icon="ChevronLeft">
              Exit Design
            </NavLink>
          </NavListItem>
        </NavList>
      </LeftNav>
      <Main flexColumn>{children}</Main>
    </Screen>
  );
}

function DesignHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <MainHeader className={className} style={{ padding: '0.75rem 1rem' }}>
      {children}
    </MainHeader>
  );
}

export const ADMIN_DESIGN_SHELL: Pick<
  DesignContextValue,
  'ElectionNavScreen' | 'Header'
> = {
  ElectionNavScreen: DesignElectionNavScreen,
  Header: DesignHeader,
};
