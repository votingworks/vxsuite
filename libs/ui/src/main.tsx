import styled from 'styled-components';
import { assert } from '@votingworks/basics';

interface Props {
  padded?: boolean;
  centerChild?: boolean;
  flexRow?: boolean;
  flexColumn?: boolean;
}

export const Main = styled('main')<Props>`
  display: ${({ centerChild, flexRow, flexColumn }) => {
    assert(
      !(flexRow && flexColumn),
      'Cannot specify both flexRow and flexColumn'
    );
    return (centerChild || flexRow || flexColumn) && 'flex';
  }};
  flex: 1;
  flex-direction: ${({ centerChild, flexColumn }) =>
    (centerChild || flexColumn) && 'column'};
  align-items: ${({ centerChild }) => centerChild && 'center'};
  justify-content: ${({ centerChild }) => centerChild && 'center'};
  overflow: auto;
  padding: ${({ padded }) => (padded ? '1rem' : undefined)};
`;
