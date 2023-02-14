import { rgba } from 'polished';
import React from 'react';
import styled from 'styled-components';

export type CardFooterAlign = 'left' | 'center' | 'right';

export interface CardProps {
  children?: React.ReactNode;
  footer?: React.ReactNode;
  footerAlign?: CardFooterAlign;
}

const StyledContainer = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => rgba(p.theme.colors.foregroundDisabled, 0.75)};
  border-radius: 0.2rem;
  box-shadow: 0.1rem 0.2rem 0.1rem -0.1rem ${(p) => rgba(p.theme.colors.foreground, 0.25)},
    0 0.1rem 0.2rem 0 ${(p) => rgba(p.theme.colors.foreground, 0.15)},
    0 0.1rem 0.3rem 0 ${(p) => rgba(p.theme.colors.foreground, 0.125)};
  overflow: hidden;

  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;

const StyledContent = styled.div`
  padding: 0.6rem;

  /* Shrink padding if there's a footer: */
  &:last-child {
    padding-bottom: 0.25rem;
  }
`;

interface StyledFooterProps {
  footerAlign: CardFooterAlign;
}

const StyledFooter = styled.div<StyledFooterProps>`
  display: flex;
  justify-content: ${(p) => p.footerAlign};
  padding: 0.25rem 0.6rem 0.6rem;
`;

/**
 * Bordered UI container providing visual separation from background and other
 * components.
 */
export function Card(props: CardProps): JSX.Element {
  const { children, footer, footerAlign } = props;

  return (
    <StyledContainer>
      <StyledContent>{children}</StyledContent>
      {footer && (
        <StyledFooter footerAlign={footerAlign || 'left'}>
          {footer}
        </StyledFooter>
      )}
    </StyledContainer>
  );
}
