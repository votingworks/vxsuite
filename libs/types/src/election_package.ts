import z from 'zod/v4';
import {
  BallotStyleId,
  BallotStyleIdSchema,
  BallotTypeSchema,
  ContestId,
  ElectionDefinition,
  PrecinctId,
  PrecinctIdSchema,
} from './election';
import { SystemSettings } from './system_settings';
import { ElectionPackageMetadata } from './election_package_metadata';
import { UiStringAudioClips } from './ui_string_audio_clips';
import { UiStringAudioIdsPackage } from './ui_string_audio_ids';
import { UiStringsPackage } from './ui_string_translations';
import { BALLOT_MODES, BaseBallotProps } from './hmpb';

export enum ElectionPackageFileName {
  APP_STRINGS = 'appStrings.json',
  AUDIO_CLIPS = 'audioClips.jsonl',
  AUDIO_IDS = 'audioIds.json',
  BALLOTS = 'ballots.jsonl',
  ELECTION = 'election.json',
  METADATA = 'metadata.json',
  SYSTEM_SETTINGS = 'systemSettings.json',
}

export interface ElectionPackage {
  ballots?: EncodedBallotEntry[];
  electionDefinition: ElectionDefinition;
  metadata?: ElectionPackageMetadata; // TODO(kofi): Make required
  systemSettings?: SystemSettings; // TODO(kevin): Make required
  uiStringAudioClips?: UiStringAudioClips; // TODO(kofi): Make required
  uiStringAudioIds?: UiStringAudioIdsPackage; // TODO(kofi): Make required
  uiStrings?: UiStringsPackage; // TODO(kofi): Make required
}

export interface ElectionPackageWithHash {
  electionPackage: ElectionPackage;
  /**
   * Hash of the raw election package data (in ZIP format, before it's parsed).
   * This can be used to ensure that a machine has been configured with the
   * correct election package.
   */
  electionPackageHash: string;
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

export interface EncodedBallotEntry extends Omit<BaseBallotProps, 'election'> {
  encodedBallot: string; // A base64-encoded ballot PDF
}

/**
 * A single ballot record in the ballots JSONL file in an election package.
 */
export const EncodedBallotEntrySchema: z.ZodType<EncodedBallotEntry> = z.object(
  {
    ballotStyleId: BallotStyleIdSchema,
    precinctId: PrecinctIdSchema,
    ballotType: BallotTypeSchema,
    ballotMode: z.enum(BALLOT_MODES),
    watermark: z.string().optional(),
    compact: z.boolean().optional(),
    ballotAuditId: z.string().optional(),
    encodedBallot: z.string(),
  }
);
