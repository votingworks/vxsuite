import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { LinkButton, LinkButtonProps } from './link_button';
import { Icons } from './icons';

/**
 * A left navigation sidebar container.
 */
export const LeftNav = styled.nav`
  background: ${(p) => p.theme.colors.inverseBackground};
  padding: 1rem;
  min-width: 14rem;
`;

/**
 * A list container for nav items.
 */
export const NavList = styled.ul`
  list-style: none;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

/**
 * A nav item in a NavList.
 */
export const NavItem = styled.li`
  /* For now, we don't need any specific styles here. */
`;

const NavLinkButton = styled(LinkButton)`
  width: 100%;
  justify-content: start;
`;

/**
 * A nav link in a NavList. Should go inside a NavItem.
 */
export function NavLink({
  isActive,
  ...linkButtonProps
}: {
  isActive: boolean;
} & LinkButtonProps): JSX.Element {
  return (
    <NavLinkButton
      fill={isActive ? 'tinted' : 'transparent'}
      color="inverseNeutral"
      rightIcon={
        isActive ? (
          <Icons.RightChevron style={{ marginLeft: 'auto' }} />
        ) : undefined
      }
      {...linkButtonProps}
    />
  );
}

/**
 * A divider line between NavItems in a NavList.
 */
export const NavDivider = styled.div`
  border-top: ${({ theme }) => theme.sizes.bordersRem.hairline}rem solid
    ${({ theme }) => theme.colors.outline};
  margin: 0.5rem 0;
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: -0.125rem;
  margin-bottom: 1rem;

  img {
    height: 2.5rem;
  }

  a {
    font-size: ${(p) => p.theme.sizes.headingsRem.h2}rem;
    font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
    color: ${(p) => p.theme.colors.onInverse};
    text-decoration: none;
  }
`;

/**
 * An app name and logo link for the top of a LeftNav. Requires the logo image
 * to be in the app's /public/images directory.
 */
export function AppLogo({ appName }: { appName: string }): JSX.Element {
  return (
    <LogoContainer>
      <img alt="VotingWorks" src="/images/logo-circle-white-on-purple.svg" />
      <Link to="/">{appName}</Link>
    </LogoContainer>
  );
}
