import type { ElectionRecord } from '@votingworks/design-backend';
import {
  convertVxfPrecincts,
  generateBallotStyles,
} from '@votingworks/design-backend';
import { electionSample } from '@votingworks/fixtures';
import { DEFAULT_LAYOUT_OPTIONS } from '@votingworks/hmpb-layout';
import { DEFAULT_SYSTEM_SETTINGS, Election } from '@votingworks/types';

export const electionId = 'election-id-1';
const baseElection = electionSample;
export const precincts = convertVxfPrecincts(baseElection);
export const ballotStyles = generateBallotStyles(baseElection, precincts);
export const election: Election = {
  ...baseElection,
  ballotStyles: ballotStyles.map((ballotStyle) => ({
    ...ballotStyle,
    precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
    districts: ballotStyle.districtIds,
  })),
};

export const electionRecord: ElectionRecord = {
  id: electionId,
  election,
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
  // TODO more realistic data for precincts and ballot styles in tests in
  // general, even though they are not used here
  precincts,
  ballotStyles,
  layoutOptions: DEFAULT_LAYOUT_OPTIONS,
  createdAt: new Date().toISOString(),
};
