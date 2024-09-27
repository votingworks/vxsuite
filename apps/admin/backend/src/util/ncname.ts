import {
  Candidate,
  Contest,
  District,
  Election,
  Party,
  YesNoContest,
  Tabulation,
} from '@votingworks/types';

/**
 * Formats a string as NCName by prefixing with "vx_" and removing the ":" character.
 * See: https://www.w3.org/TR/xml-names/#NT-NCName and https://www.w3.org/TR/REC-xml/#NT-NameStartChar.
 */
function asNcName(id: string): string {
  return `vx_${id.replaceAll(':', '')}`;
}

/**
 * Gets the state ID from an Election, formatted as an NCName.
 */
export function getStateId(election: Election): string {
  return asNcName(election.state.toLowerCase().replaceAll(' ', '-'));
}

/**
 * Gets the county ID from an Election, formatted as an NCName.
 */
export function getCountyId(election: Election): string {
  return asNcName(election.county.id);
}

/**
 * Gets the district ID from a District, formatted as an NCName.
 */
export function getDistrictId(district: District): string {
  return asNcName(district.id);
}

/**
 * Gets the contest ID from a Contest, formatted as an NCName.
 */
export function getContestId(contest: Contest): string {
  return asNcName(contest.id);
}

/**
 * Gets the district ID from a Contest, formatted as an NCName.
 */
export function getDistrictIdFromContest(contest: Contest): string {
  return asNcName(contest.districtId);
}

/**
 * Gets the party ID from a Party, formatted as an NCName.
 */
export function getPartyId(party: Party): string {
  return asNcName(party.id);
}

/**
 * Gets the candidate ID from a Candidate, formatted as an NCName.
 */
export function getCandidateId(candidate: Candidate): string {
  return asNcName(candidate.id);
}

/**
 * Constructs a candidate selection ID in the format `vx_<contestId>_<candidateTallyId>`, formatted as an NCName.
 */
export function getCandidateSelectionId(
  contest: Contest,
  candidateTally: Tabulation.CandidateTally
): string {
  return asNcName(`${contest.id}_${candidateTally.id}`);
}

/**
 * Gets the ID for the "Yes" option in a YesNoContest, formatted as an NCName.
 */
export function getYesOptionId(contest: YesNoContest): string {
  return asNcName(contest.yesOption.id);
}

/**
 * Gets the ID for the "No" option in a YesNoContest, formatted as an NCName.
 */
export function getNoOptionId(contest: YesNoContest): string {
  return asNcName(contest.noOption.id);
}

/**
 * Gets the party ID for a Candidate, formatted as an NCName.
 */
export function getPartyIdForCandidate(
  candidate: Candidate
): string | undefined {
  /* istanbul ignore next -- trivial fallthrough case */
  return candidate.partyIds?.[0] ? asNcName(candidate.partyIds[0]) : undefined;
}
