import styled from 'styled-components'

const Table = styled.table`
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
  width: 1%;
  text-align: ${({ textAlign }) => textAlign};
`

export default Table
