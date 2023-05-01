import { ElectionDefinition } from '@votingworks/types';
import { DownloadableArchive } from '../utils/downloadable_archive';

export type State = Init | ArchiveBegin | ArchiveEnd | Done | Failed;

export interface Init {
  type: 'Init';
  electionDefinition: ElectionDefinition;
}

export interface ArchiveBegin {
  type: 'ArchiveBegin';
  electionDefinition: ElectionDefinition;
  archive: DownloadableArchive;
}

export interface ArchiveEnd {
  type: 'ArchiveEnd';
  archive: DownloadableArchive;
}

export interface Done {
  type: 'Done';
}

export interface Failed {
  type: 'Failed';
  message: string;
}

export function init(electionDefinition: ElectionDefinition): Init {
  return {
    type: 'Init',
    electionDefinition,
  };
}

export function next(state: State): State {
  switch (state.type) {
    case 'Init':
      return {
        type: 'ArchiveBegin',
        electionDefinition: state.electionDefinition,
        archive: new DownloadableArchive(),
      };

    case 'ArchiveBegin': {
      return {
        type: 'ArchiveEnd',
        archive: state.archive,
      };
    }

    case 'ArchiveEnd':
      return {
        type: 'Done',
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
