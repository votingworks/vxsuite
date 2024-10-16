import styled from 'styled-components';

export const ContestFooter = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 0.5rem;
`;

export const ChoicesGrid = styled.div.attrs({
  'aria-multiselectable': true,
  role: 'listbox',
})`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.5rem;

  /*
   * Add a little vertical padding to account for focus outlines on the contest
   * choice buttons, which would otherwise get cut off:
   */
  padding: ${(p) => p.theme.sizes.bordersRem.medium}rem 0;
`;
