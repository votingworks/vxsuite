import { Table as UiTable } from '@votingworks/ui';
import { Row } from '@votingworks/election-definition-ui';
import styled from 'styled-components';

export const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  input[type='text'] {
    min-width: 18rem;
  }

  .search-select {
    min-width: 18rem;
  }
`;

export const FormActionsRow = styled(Row)`
  gap: 0.5rem;

  button {
    min-width: 8rem;
  }
`;

export const Table = styled(UiTable)`
  td:last-child {
    text-align: right;
    padding-right: 0;
  }
`;

// [TODO] Remove after instances are replaced with `ListActionsRow`.
export const TableActionsRow = styled(Row)`
  margin-bottom: 1rem;
  gap: 0.5rem;
`;

export const NestedTr = styled.tr`
  td:first-child {
    padding-left: 3rem;
  }
`;
