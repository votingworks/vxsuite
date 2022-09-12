import styled, { css } from 'styled-components';

interface TableProps {
  borderTop?: boolean;
  condensed?: boolean;
  expanded?: boolean;
}

const borderColor = 'rgb(194, 200, 203)';

export const Table = styled.table<TableProps>`
  border-top: ${({ borderTop = false }) =>
    borderTop ? '1px solid' : undefined};
  border-color: ${borderColor};
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  & th,
  & td {
    border-bottom: 1px solid ${borderColor};
    padding: ${({ condensed, expanded }) =>
      condensed
        ? '0.15rem 0.25rem'
        : expanded
        ? '0.25rem 1rem'
        : '0.25rem 0.5rem'};
  }
  & th {
    border-top: 1px solid ${borderColor};
    font-size: 0.75rem;
  }
  @media print {
    border-top: 1px solid ${borderColor};
  }
`;

interface TableCellProps {
  narrow?: boolean;
  nowrap?: boolean;
  textAlign?: 'right' | 'left' | 'center';
}

const tableCellStyles = css<TableCellProps>`
  width: ${({ narrow = false }) => (narrow ? '1%' : undefined)};
  text-align: ${({ textAlign }) => textAlign};
`;

export const TD = styled.td<TableCellProps>`
  white-space: ${({ nowrap }) => (nowrap ? 'nowrap' : undefined)};
  ${tableCellStyles}/* stylelint-disable-line value-keyword-case */
`;

export const TH = styled.th<TableCellProps>`
  white-space: ${({ nowrap }) => (nowrap === false ? undefined : 'nowrap')};
  ${tableCellStyles}/* stylelint-disable-line value-keyword-case */
`;
