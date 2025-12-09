import type {
  ElectionInfo,
  ElectionListing,
  ElectionRecord,
} from '@votingworks/design-backend';
import { createBlankElection } from '@votingworks/design-backend';
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
  jurisdictionId: Id
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
    electionType: baseElection.type,
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
    type: election.type,
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
    jurisdictionId: record.jurisdictionId,
  };
}

export function electionListing(
  electionRecord: ElectionRecord
): ElectionListing {
  const { election, jurisdictionId } = electionRecord;
  return {
    jurisdictionId,
    jurisdictionName: `${jurisdictionId} Name`,
    electionId: election.id,
    title: election.title,
    date: election.date,
    type: election.type,
    state: election.state,
    countyName: election.county.name,
    status: 'inProgress',
  };
}

export function blankElectionRecord(jurisdictionId: Id): ElectionRecord {
  return makeElectionRecord(createBlankElection(generateId()), jurisdictionId);
}
export function blankElectionInfo(jurisdictionId: Id): ElectionInfo {
  return electionInfoFromElection(blankElectionRecord(jurisdictionId).election);
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
export function generalElectionInfo(jurisdictionId: Id): ElectionInfo {
  return electionInfoFromRecord(generalElectionRecord(jurisdictionId));
}
