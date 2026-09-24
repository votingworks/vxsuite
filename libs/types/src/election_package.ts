import z from 'zod/v4';
import {
  type BallotStyleId,
  BallotStyleIdSchema,
  BallotTypeSchema,
  type ContestId,
  type ElectionDefinition,
  type PrecinctId,
  PrecinctIdSchema,
} from './election.js';
import type { SystemSettings } from './system_settings.js';
import type { ElectionPackageMetadata } from './election_package_metadata.js';
import type { ElectionRegisteredVoterCounts } from './registered_voter_counts.js';
import type { UiStringAudioClips } from './ui_string_audio_clips.js';
import type { UiStringAudioIdsPackage } from './ui_string_audio_ids.js';
import type { UiStringsPackage } from './ui_string_translations.js';
import { BALLOT_MODES, type BaseBallotProps } from './hmpb.js';

export enum ElectionPackageFileName {
  APP_STRINGS = 'appStrings.json',
  AUDIO_CLIPS = 'audioClips.jsonl',
  AUDIO_IDS = 'audioIds.json',
  BALLOT_POSITIONS = 'ballotPositions.jsonl',
  BALLOTS = 'ballots.jsonl',
  ELECTION = 'election.json',
  METADATA = 'metadata.json',
  REGISTERED_VOTER_COUNTS = 'registeredVoterCounts.json',
  SYSTEM_SETTINGS = 'systemSettings.json',
}

export interface ElectionPackage {
  ballots?: EncodedBallotEntry[];
  electionDefinition: ElectionDefinition;
  metadata: ElectionPackageMetadata;
  registeredVoterCounts?: ElectionRegisteredVoterCounts;
  systemSettings: SystemSettings;
  uiStringAudioClips: UiStringAudioClips;
  uiStringAudioIds: UiStringAudioIdsPackage;
  uiStrings: UiStringsPackage;
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
