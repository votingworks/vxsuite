import { ElectionDefinition } from '@votingworks/types'
import { EventEmitter } from 'events'
import { ReviewBallot, BallotSheetInfo } from '../config/types'
import { BallotPackage, BallotPackageEntry } from '../util/ballot-package'
import fetchJSON from '../util/fetchJSON'
import { setElection } from './config'

export interface AddTemplatesEvents extends EventEmitter {
  on(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this
  on(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this
  on(event: 'completed', callback: (pkg: BallotPackage) => void): this
  on(event: 'error', callback: (error: Error) => void): this
  off(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this
  off(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this
  off(event: 'completed', callback: (pkg: BallotPackage) => void): this
  off(event: 'error', callback: (error: Error) => void): this
  emit(
    event: 'configuring',
    pkg: BallotPackage,
    electionDefinition: ElectionDefinition
  ): boolean
  emit(
    event: 'uploading',
    pkg: BallotPackage,
    entry: BallotPackageEntry
  ): boolean
  emit(event: 'completed', pkg: BallotPackage): boolean
  emit(event: 'error', error: Error): boolean
}

export function addTemplates(pkg: BallotPackage): AddTemplatesEvents {
  const result: AddTemplatesEvents = new EventEmitter()

  setImmediate(async () => {
    try {
      result.emit('configuring', pkg, pkg.electionDefinition)
      await setElection(pkg.electionDefinition.electionData)

      for (const ballot of pkg.ballots) {
        result.emit('uploading', pkg, ballot)

        const body = new FormData()

        body.append(
          'ballots',
          new Blob([ballot.pdf], { type: 'application/pdf' })
        )

        body.append(
          'metadatas',
          new Blob([JSON.stringify(ballot.ballotConfig)], {
            type: 'application/json',
          })
        )

        // eslint-disable-next-line no-await-in-loop
        await fetch('/scan/hmpb/addTemplates', { method: 'POST', body })
      }

      result.emit('completed', pkg)
    } catch (error) {
      result.emit('error', error)
    }
  })

  return result
}

export async function doneTemplates(): Promise<void> {
  await fetch('/scan/hmpb/doneTemplates', { method: 'POST' })
}

export function fetchBallotInfo(ballotId: string): Promise<ReviewBallot> {
  return fetchJSON<ReviewBallot>(`/scan/hmpb/ballot/${ballotId}`)
}

export async function fetchNextBallotToReview(): Promise<
  ReviewBallot | undefined
> {
  try {
    return await fetchJSON<ReviewBallot>('/scan/hmpb/review/next-ballot')
  } catch {
    return undefined
  }
}

export async function fetchNextBallotSheetToReview(): Promise<
  BallotSheetInfo | undefined
> {
  try {
    return await fetchJSON<BallotSheetInfo>('/scan/hmpb/review/next-sheet')
  } catch {
    return undefined
  }
}
