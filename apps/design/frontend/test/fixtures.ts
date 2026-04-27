import type {
  ElectionInfo,
  ElectionListing,
  ElectionRecord,
  Jurisdiction,
} from '@votingworks/design-backend';
import { createBlankElection } from '@votingworks/design-backend';
import {
  electionTypeV4p0ToV4p1,
  BallotLanguageConfigs,
  Candidate,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionTypeV4p1,
  Id,
  LanguageCode,
} from '@votingworks/types';
import {
  electionOpenPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { generateBallotStyles } from '@votingworks/hmpb';
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
  jurisdictionId: Id,
  electionType: ElectionTypeV4p1 = electionTypeV4p0ToV4p1(baseElection.type)
): ElectionRecord {
  const ballotLanguageConfigs: BallotLanguageConfigs = [
    { languages: [LanguageCode.ENGLISH] },
  ];
  const contests = baseElection.contests.map((contest) =>
    contest.type === 'candidate'
      ? {
          ...contest,
          candidates: contest.candidates.map(splitCandidateName),
        }
      : contest
  );
  const ballotStyles = generateBallotStyles({
    ballotLanguageConfigs,
    contests,
    electionType,
    parties: baseElection.parties,
    precincts: [...baseElection.precincts],
    ballotTemplateId: 'VxDefaultBallot',
    electionId: baseElection.id,
  });
  const election: Election = {
    ...baseElection,
    ballotStyles,
    contests,
  };
  return {
    election,
    type: electionType,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    createdAt: new Date().toISOString(),
    ballotLanguageConfigs,
    ballotTemplateId: 'VxDefaultBallot',
    ballotsFinalizedAt: null,
    jurisdictionId,
  };
}

export function electionInfoFromElection(election: Election): ElectionInfo {
  return {
    jurisdictionId: `jurisdiction-${election.id}`,
    electionId: election.id,
    title: election.title,
    date: election.date,
    type: electionTypeV4p0ToV4p1(election.type),
    state: election.state,
    countyName: election.county.name,
    seal: election.seal,
    signatureImage: election.signature?.image,
    signatureCaption: election.signature?.caption,
    languageCodes: [LanguageCode.ENGLISH],
  };
}

export function electionInfoFromRecord(record: ElectionRecord): ElectionInfo {
  return {
    ...electionInfoFromElection(record.election),
    type: record.type,
    jurisdictionId: record.jurisdictionId,
  };
}

export function electionListing(
  electionRecord: ElectionRecord
): ElectionListing {
  const { election, type, jurisdictionId } = electionRecord;
  return {
    jurisdictionId,
    jurisdictionName: `${jurisdictionId} Name`,
    electionId: election.id,
    title: election.title,
    date: election.date,
    type,
    state: election.state,
    countyName: election.county.name,
    status: 'inProgress',
  };
}

export function blankElectionRecord(
  jurisdiction: Jurisdiction
): ElectionRecord {
  return makeElectionRecord(
    createBlankElection(generateId(), jurisdiction),
    jurisdiction.id
  );
}
export function blankElectionInfo(jurisdiction: Jurisdiction): ElectionInfo {
  return electionInfoFromElection(blankElectionRecord(jurisdiction).election);
}
export function generalElectionRecord(jurisdictionId: Id): ElectionRecord {
  return makeElectionRecord(readElectionGeneral(), jurisdictionId);
}
export function primaryElectionRecord(jurisdictionId: Id): ElectionRecord {
  return makeElectionRecord(
    electionPrimaryPrecinctSplitsFixtures.readElection(),
    jurisdictionId
  );
}
export function openPrimaryElectionRecord(jurisdictionId: Id): ElectionRecord {
  return makeElectionRecord(
    electionOpenPrimaryFixtures.readElection(),
    jurisdictionId,
    'open-primary'
  );
}
export function generalElectionInfo(jurisdictionId: Id): ElectionInfo {
  return electionInfoFromRecord(generalElectionRecord(jurisdictionId));
}
