import { Result } from '@votingworks/basics';

import {
  BallotStyleId,
  ContestId,
  ElectionDefinition,
  PrecinctId,
} from './election';
import { SystemSettings } from './system_settings';

export interface BallotPackage {
  electionDefinition: ElectionDefinition;
  // TODO(kevin) once all machines support system settings, make systemSettings required
  systemSettings?: SystemSettings;
}

export interface BallotStyleData {
  ballotStyleId: BallotStyleId;
  contestIds: ContestId[];
  precinctId: PrecinctId;
}

export interface BallotConfig extends BallotStyleData {
  filename: string;
  layoutFilename: string;
  isLiveMode: boolean;
  isAbsentee: boolean;
}

export type BallotPackageExportError = 'no_usb_drive';
export type BallotPackageExportResult = Result<void, BallotPackageExportError>;
