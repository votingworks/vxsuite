import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import { ScanStatusResponse, AdjudicationStatus } from '../config/types'

import Prose from '../components/Prose'
import Table, { TD } from '../components/Table'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Text from '../components/Text'

pluralize.addIrregularRule('requires', 'require')
pluralize.addIrregularRule('has', 'have')

const Scanning = styled.em`
  color: rgb(71, 167, 75);
`

const z2 = (number: number) => number.toString().padStart(2, '0')

const shortDateTime = (iso8601Timestamp: string) => {
  const d = new Date(iso8601Timestamp)
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(
    d.getDate()
  )} ${d.getHours()}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`
}

interface Props {
  adjudicationStatus: AdjudicationStatus
  isScanning: boolean
  status: ScanStatusResponse
  deleteBatch(batchId: string): Promise<void>
}

const DashboardScreen: React.FC<Props> = ({
  adjudicationStatus,
  isScanning,
  status,
  deleteBatch,
}) => {
  const { batches } = status
  const batchCount = batches.length
  const ballotCount =
    batches && batches.reduce((result, b) => result + b.count, 0)

  const adjudicationSentence = (
    <React.Fragment>
      {' '}
      {pluralize('ballot', adjudicationStatus.adjudicated, true)}{' '}
      {pluralize('has', adjudicationStatus.adjudicated)} been adjudicated,{' '}
      {pluralize('ballot', adjudicationStatus.remaining, true)}{' '}
      {pluralize('require', adjudicationStatus.remaining)} review.
    </React.Fragment>
  )

  const [pendingDeleteBatchId, setPendingDeleteBatchId] = useState<string>()
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)
  const [deleteBatchError, setDeleteBatchError] = useState<string>()

  const confirmDeleteBatch = useCallback(() => {
    setIsDeletingBatch(true)
  }, [])

  const cancelDeleteBatch = useCallback(() => {
    setPendingDeleteBatchId(undefined)
    setDeleteBatchError(undefined)
  }, [])

  const onDeleteBatchSucceeded = useCallback(() => {
    setIsDeletingBatch(false)
    setPendingDeleteBatchId(undefined)
  }, [])

  const onDeleteBatchFailed = useCallback((error: Error) => {
    setIsDeletingBatch(false)
    setDeleteBatchError(error.message)
  }, [])

  useEffect(() => {
    if (pendingDeleteBatchId && isDeletingBatch) {
      let isMounted = true
      ;(async () => {
        try {
          await deleteBatch(pendingDeleteBatchId)

          if (isMounted) {
            onDeleteBatchSucceeded()
          }
        } catch (error) {
          if (isMounted) {
            onDeleteBatchFailed(error)
          }
        }
      })()
      return () => {
        isMounted = false
      }
    }
  }, [pendingDeleteBatchId, isDeletingBatch, deleteBatch])

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
              <strong>{pluralize('batch', batchCount, true)}</strong>.
              {false && adjudicationSentence}
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
                        onPress={() => setPendingDeleteBatchId(batch.id)}
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
      {pendingDeleteBatchId && (
        <Modal
          centerContent
          onOverlayClick={isDeletingBatch ? undefined : cancelDeleteBatch}
          content={
            <Prose textCenter>
              <h1>Delete batch {pendingDeleteBatchId}?</h1>
              <p>This action cannot be undone.</p>
              {deleteBatchError && <Text error>{deleteBatchError}</Text>}
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={cancelDeleteBatch} disabled={isDeletingBatch}>
                Cancel
              </Button>
              <Button
                danger
                onPress={confirmDeleteBatch}
                disabled={isDeletingBatch}
              >
                {isDeletingBatch ? 'Deleting…' : 'Yes, Delete Batch'}
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  )
}

export default DashboardScreen
