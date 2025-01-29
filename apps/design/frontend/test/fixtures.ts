import type { ElectionInfo, ElectionRecord } from '@votingworks/design-backend';
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
  LanguageCode,
} from '@votingworks/types';
import { generateId } from '../src/utils';

export function makeElectionRecord(baseElection: Election): ElectionRecord {
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
  };
}

export const blankElectionRecord = makeElectionRecord(
  createBlankElection(generateId() as ElectionId)
);
export const blankElectionInfo: ElectionInfo = {
  electionId: blankElectionRecord.election.id,
  type: blankElectionRecord.election.type,
  date: blankElectionRecord.election.date,
  title: blankElectionRecord.election.title,
  jurisdiction: blankElectionRecord.election.county.name,
  state: blankElectionRecord.election.state,
  seal: blankElectionRecord.election.seal,
};
export const generalElectionRecord = makeElectionRecord(readElectionGeneral());
export const primaryElectionRecord = makeElectionRecord(
  electionPrimaryPrecinctSplitsFixtures.readElection()
);
export const generalElectionInfo: ElectionInfo = {
  electionId: generalElectionRecord.election.id,
  type: generalElectionRecord.election.type,
  date: generalElectionRecord.election.date,
  title: generalElectionRecord.election.title,
  jurisdiction: generalElectionRecord.election.county.name,
  state: generalElectionRecord.election.state,
  seal: generalElectionRecord.election.seal,
};
