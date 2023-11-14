import {
  BallotStyleId,
  ContestId,
  ElectionDefinition,
  PrecinctId,
} from './election';
import { SystemSettings } from './system_settings';
import { BallotPackageMetadata } from './ballot_package_metadata';
import { UiStringAudioClips } from './ui_string_audio_clips';
import { UiStringAudioIdsPackage } from './ui_string_audio_ids';
import { UiStringsPackage } from './ui_string_translations';

export enum BallotPackageFileName {
  APP_STRINGS = 'appStrings.json',
  AUDIO_CLIPS = 'audioClips.jsonl',
  ELECTION = 'election.json',
  METADATA = 'metadata.json',
  SYSTEM_SETTINGS = 'systemSettings.json',
  UI_STRING_AUDIO_IDS = 'uiStringAudioIds.json',
  VX_ELECTION_STRINGS = 'vxElectionStrings.json',
}

export interface BallotPackage {
  electionDefinition: ElectionDefinition;
  metadata?: BallotPackageMetadata; // TODO(kofi): Make required
  // TODO(kevin) once all machines support system settings, make systemSettings required
  systemSettings?: SystemSettings;
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
