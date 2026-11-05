import { cssThemedScrollbars, DesktopPalette } from '@votingworks/ui';
import styled from 'styled-components';

export const FormBody = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1.5rem;
  height: 100%;
  overflow: auto;
  padding: 1rem;

  ${cssThemedScrollbars}

  input[type='text'] {
    min-width: 18rem;
  }

  .search-select {
    min-width: 18rem;
  }
`;

export const FormErrorContainer = styled.div`
  margin: 0 1rem;
  padding-bottom: 1rem;

  :empty {
    display: none;
  }

  > * {
    max-width: calc(55ch + 2rem);
  }
`;

export const FormFooter = styled.div`
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0 1rem;
  padding: 1rem 0;
`;
