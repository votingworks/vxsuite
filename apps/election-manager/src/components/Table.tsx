import styled from 'styled-components'

interface Props {
  borderTop?: boolean
  condensed?: boolean
}

const borderColor = 'rgb(194, 200, 203)'

const Table = styled.table<Props>`
  border-top: ${({ borderTop = false }) =>
    borderTop ? '1px solid' : undefined};
  border-color: ${borderColor};
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  & th,
  & td {
    border-bottom: 1px solid ${borderColor};
    padding: ${({ condensed }) =>
      condensed ? '0.15rem 0.25rem' : '0.25rem 0.5rem'};
  }
  & th {
    border-top: 1px solid ${borderColor};
    font-size: 0.75rem;
  }
  @media print {
    border-top: 1px solid ${borderColor};
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
  white-space: ${({ nowrap }) => (nowrap ? 'nowrap' : undefined)};
`

export default Table
