import {
  AdminCardData,
  Election,
  PollworkerCardData,
  VoterCardData,
} from '@votingworks/types';
import { strict as assert } from 'assert';

/**
 * Returns current UTC unix timestamp (epoch) in seconds
 */
function utcTimestamp(): number {
  return Math.round(Date.now() / 1000);
}

export function makeAdminCard(
  electionHash: string,
  pin?: string
): AdminCardData {
  return {
    t: 'admin',
    h: electionHash,
    p: pin,
  };
}

export function makePollWorkerCard(electionHash: string): PollworkerCardData {
  return {
    t: 'pollworker',
    h: electionHash,
  };
}

export function makeInvalidPollWorkerCard(): PollworkerCardData {
  return makePollWorkerCard(
    'd34db33f' // wrong election
  );
}

export function makeVoterCard(
  election: Election,
  cardData: Partial<VoterCardData> = {}
): VoterCardData {
  const ballotStyle = cardData.bs
    ? election.ballotStyles.find(({ id }) => id === cardData.bs)
    : election.ballotStyles[0];
  assert(ballotStyle, `missing ballot style: ${cardData.bs}`);

  const precinct = election.precincts.find(
    ({ id }) => id === (cardData.pr ?? ballotStyle.precincts[0])
  );
  assert(
    precinct,
    `missing precinct: ${cardData.pr ?? ballotStyle.precincts[0]}`
  );

  return {
    t: 'voter',
    c: utcTimestamp(),
    pr: precinct.id,
    bs: ballotStyle.id,
    ...cardData,
  };
}

export function makeVoidedVoterCard(election: Election): VoterCardData {
  return makeVoterCard(election, {
    uz: utcTimestamp(),
  });
}

export function makeUsedVoterCard(election: Election): VoterCardData {
  return makeVoterCard(election, {
    bp: utcTimestamp(),
  });
}
