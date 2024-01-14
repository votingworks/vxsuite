import {
  BallotStyleId,
  ContestId,
  ElectionDefinition,
  PrecinctId,
} from './election';
import { SystemSettings } from './system_settings';
import { ElectionPackageMetadata } from './election_package_metadata';
import { UiStringAudioClips } from './ui_string_audio_clips';
import { UiStringAudioIdsPackage } from './ui_string_audio_ids';
import { UiStringsPackage } from './ui_string_translations';

export enum ElectionPackageFileName {
  APP_STRINGS = 'appStrings.json',
  AUDIO_CLIPS = 'audioClips.jsonl',
  AUDIO_IDS = 'audioIds.json',
  ELECTION = 'election.json',
  METADATA = 'metadata.json',
  SYSTEM_SETTINGS = 'systemSettings.json',
  VX_ELECTION_STRINGS = 'vxElectionStrings.json',
}

export interface ElectionPackage {
  electionDefinition: ElectionDefinition;
  metadata?: ElectionPackageMetadata; // TODO(kofi): Make required
  systemSettings?: SystemSettings; // TODO(kevin): Make required
  uiStringAudioClips?: UiStringAudioClips; // TODO(kofi): Make required
  uiStringAudioIds?: UiStringAudioIdsPackage; // TODO(kofi): Make required
  uiStrings?: UiStringsPackage; // TODO(kofi): Make required
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
