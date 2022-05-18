import styled from 'styled-components';

interface Props {
  padded?: boolean;
  centerChild?: boolean;
  flexRow?: boolean;
  flexColumn?: boolean;
}

export const Main = styled('main')<Props>`
  display: ${({ centerChild, flexRow, flexColumn }) =>
    (centerChild || flexRow || flexColumn) && 'flex'};
  flex: 1;
  flex-direction: ${({ centerChild, flexColumn }) =>
    (centerChild || flexColumn) && 'column'};
  align-items: ${({ centerChild }) => centerChild && 'center'};
  justify-content: ${({ centerChild }) => centerChild && 'center'};
  overflow: auto;
  padding: ${({ padded }) => (padded ? '1rem' : undefined)};
`;
