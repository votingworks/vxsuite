import styled from 'styled-components';
import { ColorString } from '@votingworks/types';
import { Card } from './card';

interface MachineModeCardTouchProps {
  borderColor: ColorString;
}

export const MachineModeCardTouch = styled.div<MachineModeCardTouchProps>`
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.125em 0.5em;
  border: ${(p) => p.theme.sizes.bordersRem.thin}em solid
    ${(p) => p.borderColor};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}em;
  color: ${(p) => p.theme.colors.onBackground};
  background-color: ${(p) => p.theme.colors.background};
`;

export const MachineModeCardDesktop = styled(Card)`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

  > div {
    padding: 0.5rem 1rem;
  }

  flex-shrink: 0;
`;
