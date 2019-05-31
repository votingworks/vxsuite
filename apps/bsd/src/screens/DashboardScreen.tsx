import React from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import { ButtonEventFunction, ScannerStatus } from '../config/types'

// import Button from '../components/Button'
import Prose from '../components/Prose'

const Table = styled.table`
  width: 100%;
  & th,
  & td {
    border-bottom: 1px solid rgb(194, 200, 203);
    padding: 0.25rem 0.5rem;
    text-align: left;
    &:first-child {
      padding-left: 0;
    }
    &:last-child {
      padding-right: 0;
    }
  }
  & th {
    border-top: 1px solid rgb(194, 200, 203);
  }
  & tr:nth-child(2n) {
    td {
      background-color: rgb(222, 225, 227);
    }
  }
`

interface TableData {
  narrow?: boolean
  nowrap?: boolean
}

const TD = styled.td<TableData>`
  width: ${({ narrow = false }) => (narrow ? '1%' : undefined)};
  white-space: ${({ nowrap = false }) => (nowrap ? 'nowrap' : undefined)};
`

const Scanning = styled.em`
  color: rgb(71, 167, 75);
`

const shortDateTime = (unixTimestamp: number) => {
  const d = new Date(unixTimestamp * 1000)
  return `${d.getFullYear()}-${d.getMonth() +
    1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
}

interface Props {
  invalidateBranch: ButtonEventFunction
  isScanning: boolean
  status: ScannerStatus
}

const PrecinctsScreen = ({ isScanning, status }: Props) => {
  const { batches } = status
  const batchCount = (batches && batches.length) || 0
  const ballotCount =
    batches &&
    batches.reduce((result: number, b) => {
      result = result + b.count
      return result
    }, 0)
  return (
    <React.Fragment>
      <Prose>
        <h1>Scanned Ballot Batches</h1>
        {batchCount ? (
          <React.Fragment>
            <p>
              A total of{' '}
              <strong>{pluralize('ballots', ballotCount, true)}</strong> have
              been scanned in{' '}
              <strong>{pluralize('batches', batchCount, true)}</strong>.
            </p>
            <Table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Ballot Count</th>
                  <th>Started At</th>
                  <th>Finished At</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id}>
                    <td>{batch.id}</td>
                    <td>{batch.count}</td>
                    <TD nowrap>
                      <small>{shortDateTime(batch.startedAt)}</small>
                    </TD>
                    <TD nowrap>
                      {isScanning && !batch.endedAt ? (
                        <Scanning>Scanning…</Scanning>
                      ) : (
                        <small>{shortDateTime(batch.endedAt)}</small>
                      )}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </React.Fragment>
        ) : (
          <p>No ballots have been scanned.</p>
        )}
      </Prose>
    </React.Fragment>
  )
}

export default PrecinctsScreen
