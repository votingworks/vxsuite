import { DesktopPalette } from '@votingworks/ui';
import { css } from 'styled-components';

export const BORDER_LIGHT = css`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
`;

export const BOX_SHADOW = css`
  box-shadow: 0.125rem 0.125rem 0.25rem rgba(0, 0, 0, 10%);
`;

export const GAP = '0.5rem';

/**
 * Renders the focus outline with an inward offset to avoid issues with outlines
 * getting cut off at the edges of no-overflow containers.
 */
export const INSET_FOCUS_OUTLINE = css`
  outline: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.primary};
  outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
`;
