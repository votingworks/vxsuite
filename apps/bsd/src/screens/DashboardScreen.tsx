import React from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import { ButtonEventFunction, ScannerStatus } from '../config/types'

import Prose from '../components/Prose'
import Table, { TD } from '../components/Table'
import Button from '../components/Button'

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
  deleteBatch(batchId: number): void
}

const DashboardScreen = ({ isScanning, status, deleteBatch }: Props) => {
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
                  <th colSpan={2}>Finished At</th>
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
                    <td>
                      <Button
                        onClick={() => {
                          if (
                            // eslint-disable-next-line no-restricted-globals
                            confirm(
                              `Are you sure you want to delete batch ${batch.id}? This action cannot be undone.`
                            )
                          ) {
                            deleteBatch(batch.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </td>
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

export default DashboardScreen
