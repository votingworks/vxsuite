import styled from 'styled-components';

export const ButtonBar = styled('div')`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  padding: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;

  & > * {
    flex-grow: 1;
  }

  & > *:first-child {
    order: 2;
    min-width: 40%;
  }

  & > *:only-child {
    @media (min-width: 480px) {
      flex-grow: initial;
      margin: auto;
      min-width: 33.333%;
    }
  }
`;
