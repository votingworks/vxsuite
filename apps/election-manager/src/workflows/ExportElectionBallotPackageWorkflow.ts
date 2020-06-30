import DownloadableArchive from '../utils/DownloadableArchive'
import {
  Election,
  BallotStyle,
  Contest,
  Precinct,
  getElectionLocales,
} from '@votingworks/ballot-encoder'
import { getBallotStylesDataByStyle } from '../utils/election'
import { DEFAULT_LOCALE } from '../config/globals'

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
}

export interface ArchiveBegin {
  type: 'ArchiveBegin'
  election: Election
  archive: DownloadableArchive
}

export interface RenderBallot {
  type: 'RenderBallot'
  archive: DownloadableArchive
  ballotData: BallotStyleData[]
  ballotIndex: number
  isLiveMode: boolean
  electionLocales: string[]
  localeCodeIndex: number
}

export interface ArchiveEnd {
  type: 'ArchiveEnd'
  archive: DownloadableArchive
  ballotCount: number
  localesCount: number
}

export interface Done {
  type: 'Done'
  ballotCount: number
  localesCount: number
}

export interface Failed {
  type: 'Failed'
  message: string
}

export interface BallotStyleData {
  ballotStyleId: BallotStyle['id']
  contestIds: Contest['id'][]
  precinctId: Precinct['id']
}

export function init(election: Election): Init {
  return { type: 'Init', election }
}

export function next(state: State): State {
  switch (state.type) {
    case 'Init':
      return {
        type: 'ArchiveBegin',
        election: state.election,
        archive: new DownloadableArchive(),
      }

    case 'ArchiveBegin':
      return {
        type: 'RenderBallot',
        archive: state.archive,
        ballotData: getBallotStylesDataByStyle(state.election),
        ballotIndex: 0,
        isLiveMode: true,
        electionLocales: getElectionLocales(state.election, DEFAULT_LOCALE),
        localeCodeIndex: 0,
      }

    case 'RenderBallot':
      if (state.isLiveMode) {
        // Render the same page, but in test mode.
        return {
          ...state,
          isLiveMode: !state.isLiveMode,
        }
      }

      if (state.ballotIndex + 1 === state.ballotData.length) {
        return {
          type: 'ArchiveEnd',
          archive: state.archive,
          ballotCount: state.ballotData.length,
          localesCount: state.electionLocales.length,
        }
      }

      // next locale
      if (state.localeCodeIndex + 1 < state.electionLocales.length) {
        return {
          ...state,
          localeCodeIndex: state.localeCodeIndex + 1,
        }
      }

      // next ballot
      return {
        ...state,
        isLiveMode: !state.isLiveMode,
        ballotIndex: state.ballotIndex + 1,
        localeCodeIndex: 0,
      }

    case 'ArchiveEnd':
      return {
        type: 'Done',
        ballotCount: state.ballotCount,
        localesCount: state.localesCount,
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
