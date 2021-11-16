import {
  BallotId,
  BallotStyleId,
  Dictionary,
  ElectionDefinition,
  MachineId,
  MarkInfo,
  PrecinctId,
  SerializableBallotPageLayout,
} from '@votingworks/types';
import { z } from 'zod';

export interface MachineConfig {
  machineId: string;
  bypassAuthentication: boolean;
}
export const MachineConfigSchema: z.ZodSchema<MachineConfig> = z.object({
  machineId: MachineId,
  bypassAuthentication: z.boolean(),
});

export type MachineConfigResponse = MachineConfig;
export const MachineConfigResponseSchema = MachineConfigSchema;

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputEvent = React.FormEvent<EventTarget>;
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>;
export type ButtonEventFunction = (event: ButtonEvent) => void;

// Election
export type SetElectionDefinition = (value?: ElectionDefinition) => void;

// Scanner Types
export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean> {
  _precinctId: PrecinctId;
  _ballotStyleId: BallotStyleId;
  _ballotType: 'absentee' | 'provisional' | 'standard';
  _ballotId: BallotId;
  _testBallot: boolean;
  _scannerId: string;
}

export type Ballot = BmdBallotInfo | HmpbBallotInfo | UnreadableBallotInfo;

export interface BmdBallotInfo {
  id: number;
  filename: string;
  cvr: CastVoteRecord;
}

export interface HmpbBallotInfo {
  id: number;
  filename: string;
  cvr: CastVoteRecord;
  marks: MarkInfo;
  layout: SerializableBallotPageLayout;
}

export interface UnreadableBallotInfo {
  id: number;
  filename: string;
}
