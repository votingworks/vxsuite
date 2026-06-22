import { DesktopPalette } from '@votingworks/ui';
import { css } from 'styled-components';

export const BORDER_LIGHT = css`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
`;

export const GAP = '0.5rem';
