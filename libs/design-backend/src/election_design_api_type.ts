import type * as grout from '@votingworks/grout';
import type { buildBallotPreviewMethods } from './ballot_preview_api.js';
import type { buildElectionDefinitionMethods } from './election_definition_api.js';
import type { buildTtsMethods } from './tts_api.js';
import type { ElectionListing } from './types.js';

export type ElectionDesignMethods = ReturnType<
  typeof buildElectionDefinitionMethods
> &
  ReturnType<typeof buildBallotPreviewMethods> &
  ReturnType<typeof buildTtsMethods> & {
    listElections(): Promise<ElectionListing[]>;
  };

export type ElectionDesignApi = grout.Api<
  ElectionDesignMethods,
  grout.AnyContext
>;
