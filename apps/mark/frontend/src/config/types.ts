import {
  BallotStyleId,
  ElectionDefinition,
  PartyId,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
import {
  ContestsWithMsEitherNeither,
  UpdateVoteFunction,
} from '@votingworks/mark-flow-ui';

// Ballot
export interface BallotContextInterface {
  machineConfig: MachineConfig;
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  readonly electionDefinition?: ElectionDefinition;
  isCardlessVoter: boolean;
  isLiveMode: boolean;
  endVoterSession: () => Promise<void>;
  precinctId?: PrecinctId;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
  // `selectedPartyId` and `selectParty` apply only to open primaries, where the
  // voter picks a party at the start of their session. In closed primaries the
  // party is determined by the ballot style; in general elections there is no
  // party. `selectedPartyId` is undefined until the voter makes a selection.
  selectedPartyId?: PartyId;
  selectParty: (partyId: PartyId) => void;
  updateVote: UpdateVoteFunction;
  votes: VotesDict;
}
