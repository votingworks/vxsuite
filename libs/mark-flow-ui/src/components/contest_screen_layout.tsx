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
`;
