import { Election } from '@votingworks/ballot-encoder'
import { EventEmitter } from 'events'
import { ReviewBallot } from '../config/types'
import { BallotPackage, BallotPackageEntry } from '../util/ballot-package'
import fetchJSON from '../util/fetchJSON'
import { patch as patchConfig } from './config'

export interface AddTemplatesEvents extends EventEmitter {
  on(
    event: 'configuring',
    callback: (pkg: BallotPackage, election: Election) => void
  ): this
  on(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this
  on(event: 'completed', callback: (pkg: BallotPackage) => void): this
  on(event: 'error', callback: (error: Error) => void): this
  off(
    event: 'configuring',
    callback: (pkg: BallotPackage, election: Election) => void
  ): this
  off(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this
  off(event: 'completed', callback: (pkg: BallotPackage) => void): this
  off(event: 'error', callback: (error: Error) => void): this
  emit(event: 'configuring', pkg: BallotPackage, election: Election): boolean
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
      result.emit('configuring', pkg, pkg.election)
      await patchConfig({ election: pkg.election })

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

export function fetchBallotInfo(ballotId: string): Promise<ReviewBallot> {
  return fetchJSON<ReviewBallot>(`/scan/hmpb/ballot/${ballotId}`)
}
