import React from 'react';
import styled from 'styled-components';

export type CardFooterAlign = 'left' | 'center' | 'right';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  footerAlign?: CardFooterAlign;
  style?: React.CSSProperties;
}

const StyledContainer = styled.div`
  border: ${(p) =>
      p.theme.sizeMode === 'desktop'
        ? p.theme.sizes.bordersRem.thin
        : p.theme.sizes.bordersRem.hairline}rem
    solid ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  overflow: hidden;
`;

const StyledContent = styled.div`
  padding: ${(p) => (p.theme.sizeMode === 'desktop' ? '1rem' : '0.5rem')};

  /* Shrink padding if there's a footer: */
  &:not(:last-child) {
    padding-bottom: 0.25rem;
  }
`;

interface StyledFooterProps {
  footerAlign: CardFooterAlign;
}

const StyledFooter = styled.div<StyledFooterProps>`
  display: flex;
  flex-wrap: wrap;
  justify-content: ${(p) => p.footerAlign};
  padding: 0.25rem 0.5rem 0.5rem;
  gap: 0.5rem;
`;

/**
 * Bordered UI container providing visual separation from background and other
 * components.
 */
export function Card(props: CardProps): JSX.Element {
  const { children, className, footer, footerAlign, style } = props;

  return (
    <StyledContainer className={className} style={style}>
      <StyledContent>{children}</StyledContent>
      {footer && (
        <StyledFooter footerAlign={footerAlign || 'left'}>
          {footer}
        </StyledFooter>
      )}
    </StyledContainer>
  );
}
