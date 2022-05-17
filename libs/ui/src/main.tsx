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
  flex: ${({ flexRow, flexColumn }) => (flexRow || flexColumn) && '1'};
  flex-direction: ${({ centerChild, flexColumn }) =>
    (centerChild || flexColumn) && 'column'};
  align-items: ${({ centerChild }) => centerChild && 'center'};
  justify-content: ${({ centerChild }) => centerChild && 'center'};
  overflow: auto;
  padding: ${({ padded, flexRow, flexColumn }) =>
    padded && !flexRow && !flexColumn ? '1rem 1rem 2rem' : undefined};
`;
