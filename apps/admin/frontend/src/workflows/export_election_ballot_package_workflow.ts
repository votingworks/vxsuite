import { ElectionDefinition } from '@votingworks/types';
import { DownloadableArchive } from '../utils/downloadable_archive';

export type State = Init | ArchiveBegin | ArchiveEnd | Done | Failed;

export interface Init {
  type: 'Init';
  electionDefinition: ElectionDefinition;
  ballotConfigs: readonly [];
}

export interface ArchiveBegin {
  type: 'ArchiveBegin';
  electionDefinition: ElectionDefinition;
  ballotConfigs: readonly [];
  archive: DownloadableArchive;
}

export interface ArchiveEnd {
  type: 'ArchiveEnd';
  archive: DownloadableArchive;
  ballotConfigsCount: number;
}

export interface Done {
  type: 'Done';
  ballotConfigsCount: number;
}

export interface Failed {
  type: 'Failed';
  message: string;
}

export function init(electionDefinition: ElectionDefinition): Init {
  return {
    type: 'Init',
    electionDefinition,
    ballotConfigs: [],
  };
}

export function next(state: State): State {
  switch (state.type) {
    case 'Init':
      return {
        type: 'ArchiveBegin',
        electionDefinition: state.electionDefinition,
        ballotConfigs: state.ballotConfigs,
        archive: new DownloadableArchive(),
      };

    case 'ArchiveBegin': {
      return {
        type: 'ArchiveEnd',
        archive: state.archive,
        ballotConfigsCount: state.ballotConfigs.length,
      };
    }

    case 'ArchiveEnd':
      return {
        type: 'Done',
        ballotConfigsCount: state.ballotConfigsCount,
      };

    default:
      throw new Error(`unknown state type: '${state.type}'`);
  }
}

export function error(state: State, err: Error): State {
  return {
    type: 'Failed',
    message: err.message,
  };
}
