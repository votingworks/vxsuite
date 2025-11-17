import styled, { css, FlattenSimpleInterpolation } from 'styled-components';

export interface TooltipProps {
  attachTo?: TooltipAttach;
  alignTo?: 'left' | 'right';
  bold?: boolean;
  opaque?: boolean;
}

export type TooltipAttach = 'bottom' | 'top';

const cssAttach: Record<TooltipAttach, FlattenSimpleInterpolation> = {
  bottom: css`
    bottom: calc(-0.25rem - 100%);
  `,
  top: css`
    bottom: calc(0.25rem + 100%);
  `,
};

export const Tooltip = styled.span<TooltipProps>`
  background: rgba(0, 0, 0, ${(p) => (p.opaque ? 100 : 85)}%);
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  box-shadow: 0.1rem 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%);
  color: #fff;
  font-size: 1rem;
  font-weight: ${(p) =>
    p.bold ? p.theme.sizes.fontWeight.semiBold : undefined};
  left: ${(p) => (!p.alignTo || p.alignTo === 'left' ? 0 : undefined)};
  line-height: 1.3;
  max-width: 30ch;
  padding: 0.5rem 0.75rem 0.6rem;
  position: absolute;
  right: ${(p) => (p.alignTo === 'right' ? 0 : undefined)};
  width: max-content;
  z-index: 1;

  ${(p) => cssAttach[p.attachTo || 'top']}

  &:hover {
    /* Prevent it from sticking around when moving quickly between buttons. */
    display: none !important;
  }
`;

export const tooltipContainerCss = css`
  position: relative;

  ${Tooltip} {
    display: none;
  }

  :hover {
    ${Tooltip} {
      display: block;
    }
  }

  :focus-within {
    ${Tooltip} {
      display: block;
    }

    :not(:focus-visible):not(:hover) {
      ${Tooltip} {
        display: none;
      }
    }
  }
`;

export const TooltipContainer = styled.span`
  ${tooltipContainerCss}
`;
