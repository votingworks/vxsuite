// [TODO] Move to libs/ui. Not quite ready for general use.
// Limitations:
// - Will not be visible outside the bounds of any parents with
//   `overflow: hidden`. A React.Portal-style approach is likely better here.
// - Placement isn't very flexible and adjusting placement based on proximity to
//   screen/container edge is currently manual.
// - Optimized for use on block elements; doesn't handle inline elements without
//   additional custom styling.

import styled, { css, FlattenSimpleInterpolation } from 'styled-components';

export interface TooltipProps {
  attachTo?: TooltipAttach;
  alignTo?: 'left' | 'right';
  bold?: boolean;
  opaque?: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

export type TooltipAttach = 'bottom' | 'top';

const cssAttach: Record<TooltipAttach, FlattenSimpleInterpolation> = {
  bottom: css`
    bottom: calc(-100% - 0.25rem);
  `,
  top: css`
    bottom: calc(100% + 0.25rem);
  `,
};

export const Tooltip = styled.span.attrs({ role: 'tooltip' })<TooltipProps>`
  background: rgba(0, 0, 0, ${(p) => (p.opaque ? 100 : 85)}%);
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  box-shadow: 0.1rem 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%);
  color: #fff;
  font-size: 1rem;
  font-weight: ${(p) =>
    p.bold ? p.theme.sizes.fontWeight.semiBold : undefined};
  left: ${(p) => (!p.alignTo || p.alignTo === 'left' ? 0 : undefined)};
  line-height: 1.3;
  max-width: 45ch;
  padding: 0.5rem 0.75rem;
  position: absolute;
  text-align: ${(p) => p.textAlign || 'left'};
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
  width: min-content;

  ${Tooltip} {
    display: none;
  }

  :hover {
    ${Tooltip} {
      display: block;
    }
  }

  :focus-visible:focus-within {
    ${Tooltip} {
      display: block;
    }
  }
`;

export const TooltipContainer = styled.div`
  ${tooltipContainerCss}
`;
