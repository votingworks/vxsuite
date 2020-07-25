import React from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import {
  ButtonEventFunction,
  ScanStatusResponse,
  AdjudicationStatus,
} from '../config/types'

import Prose from '../components/Prose'
import Table, { TD } from '../components/Table'
import Button from '../components/Button'

pluralize.addIrregularRule('requires', 'require')
pluralize.addIrregularRule('has', 'have')

const Scanning = styled.em`
  color: rgb(71, 167, 75);
`

const z2 = (number: number) => number.toString().padStart(2, '0')

const shortDateTime = (unixTimestamp: number) => {
  const d = new Date(unixTimestamp * 1000)
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(
    d.getDate()
  )} ${d.getHours()}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`
}

interface Props {
  adjudicationStatus: AdjudicationStatus
  invalidateBatch: ButtonEventFunction
  isScanning: boolean
  status: ScanStatusResponse
  deleteBatch(batchId: number): void
}

const DashboardScreen = ({
  adjudicationStatus,
  isScanning,
  status,
  deleteBatch,
}: Props) => {
  const { batches } = status
  const batchCount = batches.length
  const ballotCount =
    batches && batches.reduce((result, b) => result + b.count, 0)
  return (
    <React.Fragment>
      <Prose maxWidth={false}>
        <h1>Scanned Ballot Batches</h1>
        {batchCount ? (
          <React.Fragment>
            <p>
              A total of{' '}
              <strong>{pluralize('ballot', ballotCount, true)}</strong> have
              been scanned in{' '}
              <strong>{pluralize('batch', batchCount, true)}</strong>.{' '}
              {pluralize('ballot', adjudicationStatus.adjudicated, true)}{' '}
              {pluralize('has', adjudicationStatus.adjudicated)} been
              adjudicated,{' '}
              {pluralize('ballot', adjudicationStatus.remaining, true)}{' '}
              {pluralize('require', adjudicationStatus.remaining)} review.
            </p>
            <Table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Ballot Count</th>
                  <th>Started At</th>
                  <th>Finished At</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
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
                        <small>{shortDateTime(batch.endedAt!)}</small>
                      )}
                    </TD>
                    <TD narrow>
                      <Button
                        small
                        onPress={() => {
                          if (
                            // eslint-disable-next-line no-alert, no-restricted-globals
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

export default DashboardScreen
