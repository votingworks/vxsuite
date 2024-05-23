import type { ElectionRecord } from '@votingworks/design-backend';
import {
  createBlankElection,
  convertVxfPrecincts,
  generateBallotStyles,
  BallotLanguageConfigs,
} from '@votingworks/design-backend';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionGeneral,
} from '@votingworks/fixtures';
import { DEFAULT_LAYOUT_OPTIONS } from '@votingworks/hmpb-layout';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  LanguageCode,
} from '@votingworks/types';

export const electionId = 'election-id-1';

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
      precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
      districts: ballotStyle.districtIds,
      partyId: ballotStyle.partyId,
    })),
  };
  return {
    id: electionId,
    election,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    precincts,
    ballotStyles,
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    createdAt: new Date().toISOString(),
    ballotLanguageConfigs,
  };
}

export const blankElectionRecord = makeElectionRecord(createBlankElection());
export const generalElectionRecord = makeElectionRecord(electionGeneral);
export const primaryElectionRecord = makeElectionRecord(
  electionPrimaryPrecinctSplitsFixtures.election
);
