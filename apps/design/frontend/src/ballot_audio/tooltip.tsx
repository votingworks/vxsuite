import styled, { css } from 'styled-components';

export const Tooltip = styled.span<{
  alignTo?: 'left' | 'right';
  bold?: boolean;
  opaque?: boolean;
}>`
  /*
   * [TODO] No easy way to use theme colors for transparency, since they're
   * defined in 'HSL' - need to bring in the 'polished' lib used in libs/ui, or
   * create a generalized tooltip component in libs/ui.
   */
  background: rgba(0, 0, 0, ${(p) => (p.opaque ? 100 : 75)}%);
  border-radius: 0.25rem;
  bottom: calc(100% + 0.7rem);
  box-shadow: 0.1rem 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%);
  color: #fff;
  font-size: 1rem;
  font-weight: ${(p) =>
    p.bold ? p.theme.sizes.fontWeight.semiBold : undefined};
  padding: 0.5rem 0.75rem 0.6rem;
  position: absolute;
  right: ${(p) => (p.alignTo === 'right' ? 0 : undefined)};
  left: ${(p) => (!p.alignTo || p.alignTo === 'left' ? 0 : undefined)};
  width: max-content;

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

  &:focus,
  &:hover {
    ${Tooltip} {
      display: block;
    }
  }
`;

export const TooltipContainer = styled.span`
  ${tooltipContainerCss}
`;
