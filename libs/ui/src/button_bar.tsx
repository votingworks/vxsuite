import styled from 'styled-components';

export const ButtonBar = styled('div')`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  padding: 0.75rem;
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;

  & > *:first-child {
    order: 2;
    min-width: 40%;
  }

  & > * {
    flex-grow: 1;
  }

  & > *:only-child {
    @media (width >= 480px) {
      flex-grow: initial;
      margin: auto;
      min-width: 33.333%;
    }
  }
`;
