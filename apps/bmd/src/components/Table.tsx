import styled from 'styled-components'

interface Props {
  striped?: boolean
}

const Table = styled.table<Props>`
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  & th,
  & td {
    border-bottom: 1px solid rgb(194, 200, 203);
    padding: 0.25rem 0.5rem;
  }
  & th {
    border-top: 1px solid rgb(194, 200, 203);
    font-size: 0.75rem;
  }
  & tr:nth-child(2n - 1) {
    td {
      background-color: ${({ striped }) =>
        striped ? 'rgb(222, 225, 227)' : undefined};
    }
  }
  @media print {
    border-top: 1px solid rgb(194, 200, 203);
  }
`

interface TableDataProps {
  narrow?: boolean
  nowrap?: boolean
  textAlign?: 'right' | 'left' | 'center'
}

export const TD = styled.td<TableDataProps>`
  width: ${({ narrow = false }) => (narrow ? '1%' : undefined)};
  text-align: ${({ textAlign }) => textAlign};
  white-space: ${({ nowrap = false }) => (nowrap ? 'nowrap' : undefined)};
`

export default Table
