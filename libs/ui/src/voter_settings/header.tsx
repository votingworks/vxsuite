import styled from 'styled-components';

interface HeaderProps {
  portrait?: boolean;
}

/* istanbul ignore next */
export const Header = styled.div<HeaderProps>`
  align-items: ${(p) => (p.portrait ? 'stretch' : 'center')};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dotted
    ${(p) => p.theme.colors.outline};
  display: flex;
  flex-direction: ${(p) => (p.portrait ? 'column' : 'row')};
  gap: ${(p) => (p.portrait ? 0.25 : 0.5)}rem;
  padding: 0.25rem 0.5rem 0.5rem;
`;
