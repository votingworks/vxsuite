import type {
  ElectionInfo,
  ElectionListing,
  ElectionRecord,
} from '@votingworks/design-backend';
import {
  createBlankElection,
  convertVxfPrecincts,
  generateBallotStyles,
} from '@votingworks/design-backend';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  BallotLanguageConfigs,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionId,
  Id,
  LanguageCode,
} from '@votingworks/types';
import { generateId } from '../src/utils';

export function makeElectionRecord(
  baseElection: Election,
  orgId: Id
): ElectionRecord {
  const ballotLanguageConfigs: BallotLanguageConfigs = [
    { languages: [LanguageCode.ENGLISH] },
  ];
  const precincts = convertVxfPrecincts(baseElection);
  const ballotStyles = generateBallotStyles({
    ballotLanguageConfigs,
    contests: baseElection.contests,
    electionType: baseElection.type,
    parties: baseElection.parties,
    precincts,
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
  };
  return {
    election,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    ballotOrderInfo: {},
    precincts,
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
  return makeElectionRecord(
    createBlankElection(generateId() as ElectionId),
    orgId
  );
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
