import {
  ElectionManagerCardData,
  PollWorkerCardData,
  SystemAdministratorCardData,
} from '@votingworks/types';

export function makeSystemAdministratorCard(
  pin?: string
): SystemAdministratorCardData {
  return {
    t: 'system_administrator',
    p: pin ?? '123456',
  };
}

export function makeElectionManagerCard(
  electionHash: string,
  pin?: string
): ElectionManagerCardData {
  return {
    t: 'election_manager',
    h: electionHash,
    p: pin ?? '123456',
  };
}

export function makePollWorkerCard(electionHash: string): PollWorkerCardData {
  return {
    t: 'poll_worker',
    h: electionHash,
  };
}

export function makeInvalidPollWorkerCard(): PollWorkerCardData {
  return makePollWorkerCard(
    'd34db33f' // wrong election
  );
}
