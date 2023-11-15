import styled, { css } from 'styled-components';

interface TableProps {
  borderTop?: boolean;
  condensed?: boolean;
  expanded?: boolean;
}

export const Table = styled.table<TableProps>`
  border-top: ${({ theme, borderTop = false }) =>
    borderTop
      ? `${theme.sizes.bordersRem.thin}rem solid ${theme.colors.outline}`
      : undefined};
  width: 100%;
  border-collapse: collapse;
  text-align: left;

  & th,
  & td {
    border-bottom: ${(p) =>
      `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
    padding: ${({ condensed, expanded }) =>
      condensed
        ? '0.125rem 0.25rem'
        : expanded
        ? '0.25rem 1rem'
        : '0.25rem 0.5rem'};
  }

  & th {
    border-top: ${(p) =>
      `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};

    @media print {
      font-size: 0.75rem;
    }
  }

  @media print {
    border-top: ${(p) =>
      `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
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
  ${tableCellStyles}
`;

export const TH = styled.th<TableCellProps>`
  white-space: ${({ nowrap }) => (nowrap === false ? undefined : 'nowrap')};
  ${tableCellStyles}
`;
