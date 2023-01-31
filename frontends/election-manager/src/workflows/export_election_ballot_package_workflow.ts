import { ElectionDefinition } from '@votingworks/types';
import { BallotConfig } from '@votingworks/utils';
import { DownloadableArchive } from '../utils/downloadable_archive';
import { getAllBallotConfigs } from '../utils/get_all_ballot_configs';

export type State =
  | Init
  | ArchiveBegin
  | RenderBallot
  | ArchiveEnd
  | Done
  | Failed;

export interface Init {
  type: 'Init';
  electionDefinition: ElectionDefinition;
  ballotConfigs: readonly BallotConfig[];
}

export interface ArchiveBegin {
  type: 'ArchiveBegin';
  electionDefinition: ElectionDefinition;
  ballotConfigs: readonly BallotConfig[];
  archive: DownloadableArchive;
}

export interface RenderBallot {
  type: 'RenderBallot';
  electionDefinition: ElectionDefinition;
  archive: DownloadableArchive;
  ballotConfigsCount: number;
  remainingBallotConfigs: readonly BallotConfig[];
  currentBallotConfig: BallotConfig;
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

export function init(
  electionDefinition: ElectionDefinition,
  localeCodes: readonly string[]
): Init {
  return {
    type: 'Init',
    electionDefinition,
    ballotConfigs: getAllBallotConfigs(electionDefinition, localeCodes).filter(
      ({ isAbsentee }) => !isAbsentee
    ),
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
      const [currentBallotConfig, ...remainingBallotConfigs] =
        state.ballotConfigs;

      return {
        type: 'RenderBallot',
        electionDefinition: state.electionDefinition,
        archive: state.archive,
        ballotConfigsCount: state.ballotConfigs.length,
        currentBallotConfig,
        remainingBallotConfigs,
      };
    }

    case 'RenderBallot': {
      const [currentBallotConfig, ...remainingBallotConfigs] =
        state.remainingBallotConfigs;

      if (!currentBallotConfig) {
        return {
          type: 'ArchiveEnd',
          archive: state.archive,
          ballotConfigsCount: state.ballotConfigsCount,
        };
      }

      return {
        type: 'RenderBallot',
        electionDefinition: state.electionDefinition,
        archive: state.archive,
        ballotConfigsCount: state.ballotConfigsCount,
        currentBallotConfig,
        remainingBallotConfigs,
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
