import { UiTheme } from '@votingworks/types';
import React from 'react';
import styled from 'styled-components';

export type CardFooterAlign = 'left' | 'center' | 'right';

export type CardColor = 'neutral' | 'primary' | 'warning' | 'danger';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  footerAlign?: CardFooterAlign;
  style?: React.CSSProperties;
  color?: CardColor;
}

function cardColors(
  theme: UiTheme,
  color?: CardColor
): { background: string; border: string } {
  const { colors } = theme;
  if (!color) {
    return {
      background: 'none',
      border: colors.outline,
    };
  }
  return {
    neutral: {
      background: colors.containerLow,
      border: colors.outline,
    },
    primary: {
      background: colors.primaryContainer,
      border: colors.primary,
    },
    warning: {
      background: colors.warningContainer,
      border: colors.warningAccent,
    },
    danger: {
      background: colors.dangerContainer,
      border: colors.dangerAccent,
    },
  }[color];
}

const StyledContainer = styled.div<{ color?: CardColor }>`
  background-color: ${(p) => cardColors(p.theme, p.color).background};
  border: ${(p) =>
      p.theme.sizeMode === 'desktop'
        ? p.theme.sizes.bordersRem.thin
        : p.theme.sizes.bordersRem.hairline}rem
    solid ${(p) => cardColors(p.theme, p.color).border};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
`;

const StyledContent = styled.div`
  padding: ${(p) => (p.theme.sizeMode === 'desktop' ? '1rem' : '0.5rem')};
  height: 100%;

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
  const { children, className, color, footer, footerAlign, style } = props;

  return (
    <StyledContainer color={color} className={className} style={style}>
      <StyledContent>{children}</StyledContent>
      {footer && (
        <StyledFooter footerAlign={footerAlign || 'left'}>
          {footer}
        </StyledFooter>
      )}
    </StyledContainer>
  );
}
