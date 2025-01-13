import React from 'react';
import { AppLogo, LeftNav, Main, MainHeader, Screen } from '@votingworks/ui';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0.75rem;
  gap: 0.5rem;
`;

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
          <AppLogo appName="VxPollbook" />
        </Link>
        {navContent}
      </LeftNav>
      <Main flexColumn>{children}</Main>
    </Screen>
  );
}

export function NoNavScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>{children}</Main>
    </Screen>
  );
}

// export function ElectionNavScreen({
//   electionId,
//   children,
// }: {
//   electionId: string;
//   children: React.ReactNode;
// }): JSX.Element {
//   const currentRoute = useRouteMatch();
//   return (
//     <NavScreen
//       navContent={
//         <NavList>
//           {electionNavRoutes(electionId).map(({ title, path }) => (
//             <NavListItem key={path}>
//               <NavLink to={path} isActive={path === currentRoute.url}>
//                 {title}
//               </NavLink>
//             </NavListItem>
//           ))}
//           <NavDivider />
//           <NavListItem>
//             <LinkButton
//               to="/"
//               fill="transparent"
//               color="inverseNeutral"
//               icon="ChevronLeft"
//             >
//               All Elections
//             </LinkButton>
//           </NavListItem>
//         </NavList>
//       }
//     >
//       {children}
//     </NavScreen>
//   );
// }
