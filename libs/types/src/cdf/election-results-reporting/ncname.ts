import { CDF_ERR_VX_ID_PREFIX } from './constants';
import {
  Candidate,
  CandidateId,
  Contest,
  District,
  Election,
  Party,
  YesNoContest,
} from '../../election';

// Helpers for formatting IDs as xmlschema NCNames.

/**
 * Formats a string as NCName by prefixing with "vx_" and removing the ":" character.
 * See: https://www.w3.org/TR/xml-names/#NT-NCName and https://www.w3.org/TR/REC-xml/#NT-NameStartChar.
 */
export function asNcName(id: string): string {
  return `${CDF_ERR_VX_ID_PREFIX}${id.replaceAll(':', '')}`;
}

/**
 * Gets the state ID from an Election, formatted as an NCName.
 */
export function getStateId(election: Election): string {
  return asNcName(election.state.toLocaleLowerCase().replaceAll(' ', '-'));
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
  candidateId: CandidateId
): string {
  return asNcName(`${contest.id}_${candidateId}`);
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
  return candidate.partyIds?.[0] ? asNcName(candidate.partyIds[0]) : undefined;
}
