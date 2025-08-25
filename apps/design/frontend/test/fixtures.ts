import type {
  ElectionInfo,
  ElectionListing,
  ElectionRecord,
} from '@votingworks/design-backend';
import {
  createBlankElection,
  generateBallotStyles,
} from '@votingworks/design-backend';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  BallotLanguageConfigs,
  Candidate,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  Id,
  LanguageCode,
} from '@votingworks/types';
import { generateId } from '../src/utils';

function splitCandidateName(candidate: Candidate): Candidate {
  if (!candidate.firstName) {
    const [firstPart, ...middleParts] = candidate.name.split(' ');
    return {
      ...candidate,
      firstName: firstPart || undefined,
      lastName: middleParts.pop() || undefined,
      middleName: middleParts.join(' ') || undefined,
    };
  }
  return candidate;
}

export function makeElectionRecord(
  baseElection: Election,
  orgId: Id
): ElectionRecord {
  const ballotLanguageConfigs: BallotLanguageConfigs = [
    { languages: [LanguageCode.ENGLISH] },
  ];
  const ballotStyles = generateBallotStyles({
    ballotLanguageConfigs,
    contests: baseElection.contests,
    electionType: baseElection.type,
    parties: baseElection.parties,
    precincts: [...baseElection.precincts],
  });
  const election: Election = {
    ...baseElection,
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      id: ballotStyle.id,
      groupId: ballotStyle.group_id,
      precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
      districts: ballotStyle.districtIds,
      partyId: ballotStyle.partyId,
    })),
    contests: baseElection.contests.map((contest) =>
      contest.type === 'candidate'
        ? {
            ...contest,
            candidates: contest.candidates.map(splitCandidateName),
          }
        : contest
    ),
  };
  return {
    election,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    ballotStyles,
    createdAt: new Date().toISOString(),
    ballotLanguageConfigs,
    ballotTemplateId: 'VxDefaultBallot',
    ballotsFinalizedAt: null,
    orgId,
  };
}

export function electionInfoFromElection(election: Election): ElectionInfo {
  return {
    electionId: election.id,
    title: election.title,
    date: election.date,
    type: election.type,
    state: election.state,
    jurisdiction: election.county.name,
    seal: election.seal,
    signature: election.signature,
    languageCodes: [LanguageCode.ENGLISH],
  };
}

export function electionListing(
  electionRecord: ElectionRecord
): ElectionListing {
  const { election, orgId } = electionRecord;
  return {
    orgId,
    orgName: `${orgId} Name`,
    electionId: election.id,
    title: election.title,
    date: election.date,
    type: election.type,
    state: election.state,
    jurisdiction: election.county.name,
    status: 'inProgress',
  };
}

export function blankElectionRecord(orgId: Id): ElectionRecord {
  return makeElectionRecord(createBlankElection(generateId()), orgId);
}
export function blankElectionInfo(orgId: Id): ElectionInfo {
  return electionInfoFromElection(blankElectionRecord(orgId).election);
}
export function generalElectionRecord(orgId: Id): ElectionRecord {
  return makeElectionRecord(readElectionGeneral(), orgId);
}
export function primaryElectionRecord(orgId: Id): ElectionRecord {
  return makeElectionRecord(
    electionPrimaryPrecinctSplitsFixtures.readElection(),
    orgId
  );
}
export function generalElectionInfo(orgId: Id): ElectionInfo {
  return electionInfoFromElection(generalElectionRecord(orgId).election);
}
