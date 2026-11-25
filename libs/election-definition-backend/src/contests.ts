import type {
  BallotStyle,
  ContestId,
  District,
  ElectionId,
  Party,
  StraightPartyContest,
  YesNoContest,
} from '@votingworks/types';

export function hasDuplicateOptionLabels(contest: YesNoContest): boolean {
  const labels = contest.options.map((option) => option.label);
  return new Set(labels).size !== labels.length;
}

export function straightPartyContestId(electionId: ElectionId): ContestId {
  return `${electionId}-straight-party-contest`;
}

/**
 * The straight party contest for a general election, placed on a district
 * that is on every ballot style so it appears on every ballot. Undefined when
 * no district is on every ballot style.
 */
export function generateStraightPartyContest({
  electionId,
  districts,
  parties,
  ballotStyles,
}: {
  electionId: ElectionId;
  districts: readonly District[];
  parties: readonly Party[];
  ballotStyles: readonly BallotStyle[];
}): StraightPartyContest | undefined {
  const district = districts.find((d) =>
    ballotStyles.every((ballotStyle) => ballotStyle.districts.includes(d.id))
  );
  if (!district) {
    return undefined;
  }
  return {
    id: straightPartyContestId(electionId),
    type: 'straight-party',
    title: 'Straight Party Ticket',
    districtId: district.id,
    optionIds: parties.map((party) => party.id),
  };
}
