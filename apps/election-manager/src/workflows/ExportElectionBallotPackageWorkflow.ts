import { Election } from '@votingworks/ballot-encoder'
import { BallotConfig } from '../config/types'
import DownloadableArchive from '../utils/DownloadableArchive'
import getAllBallotConfigs from '../utils/getAllBallotConfigs'

export type State =
  | Init
  | ArchiveBegin
  | RenderBallot
  | ArchiveEnd
  | Done
  | Failed

export interface Init {
  type: 'Init'
  election: Election
  electionHash: string
  ballotConfigs: readonly BallotConfig[]
}

export interface ArchiveBegin {
  type: 'ArchiveBegin'
  election: Election
  electionHash: string
  ballotConfigs: readonly BallotConfig[]
  archive: DownloadableArchive
}

export interface RenderBallot {
  type: 'RenderBallot'
  election: Election
  electionHash: string
  archive: DownloadableArchive
  ballotConfigsCount: number
  remainingBallotConfigs: readonly BallotConfig[]
  currentBallotConfig: BallotConfig
}

export interface ArchiveEnd {
  type: 'ArchiveEnd'
  archive: DownloadableArchive
  ballotConfigsCount: number
}

export interface Done {
  type: 'Done'
  ballotConfigsCount: number
}

export interface Failed {
  type: 'Failed'
  message: string
}

export function init(
  election: Election,
  electionHash: string,
  localeCodes: readonly string[]
): Init {
  return {
    type: 'Init',
    election,
    electionHash,
    ballotConfigs: getAllBallotConfigs(election, electionHash, localeCodes),
  }
}

export function next(state: State): State {
  switch (state.type) {
    case 'Init':
      return {
        type: 'ArchiveBegin',
        election: state.election,
        electionHash: state.electionHash,
        ballotConfigs: state.ballotConfigs,
        archive: new DownloadableArchive(),
      }

    case 'ArchiveBegin': {
      const [
        currentBallotConfig,
        ...remainingBallotConfigs
      ] = state.ballotConfigs

      return {
        type: 'RenderBallot',
        election: state.election,
        electionHash: state.electionHash,
        archive: state.archive,
        ballotConfigsCount: state.ballotConfigs.length,
        currentBallotConfig,
        remainingBallotConfigs,
      }
    }

    case 'RenderBallot': {
      const [
        currentBallotConfig,
        ...remainingBallotConfigs
      ] = state.remainingBallotConfigs

      if (!currentBallotConfig) {
        return {
          type: 'ArchiveEnd',
          archive: state.archive,
          ballotConfigsCount: state.ballotConfigsCount,
        }
      }

      return {
        type: 'RenderBallot',
        election: state.election,
        electionHash: state.electionHash,
        archive: state.archive,
        ballotConfigsCount: state.ballotConfigsCount,
        currentBallotConfig,
        remainingBallotConfigs,
      }
    }

    case 'ArchiveEnd':
      return {
        type: 'Done',
        ballotConfigsCount: state.ballotConfigsCount,
      }

    default:
      throw new Error(`unknown state type: '${state.type}'`)
  }
}

export function error(state: State, error: Error): State {
  return {
    type: 'Failed',
    message: error.message,
  }
}
