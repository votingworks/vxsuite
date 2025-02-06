import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { Election, LanguageCode } from '@votingworks/types';
import { BallotTemplateId } from '@votingworks/hmpb';
import { expect, test } from 'vitest';
import { createBallotPropsForTemplate } from './ballots';
import { UsState } from './types';

const election: Election = {
  ...electionGridLayoutNewHampshireHudsonFixtures.readElection(),
  state: UsState.NEW_HAMPSHIRE,
};
const precincts = election.precincts.map((p) => ({
  districtIds: [election.districts[0].id],
  id: p.id,
  name: p.name,
}));
const ballotStyles = election.ballotStyles.map((b) => ({
  districtIds: b.districts,
  group_id: b.groupId,
  id: b.id,
  languages: [LanguageCode.ENGLISH],
  precinctsOrSplits: [{ precinctId: election.precincts[0].id }],
}));

test('compact templates', () => {
  const normalTemplates: BallotTemplateId[] = [
    'NhBallot',
    'NhBallotV3',
    'VxDefaultBallot',
  ];
  for (const templateId of normalTemplates) {
    const propLists = createBallotPropsForTemplate(
      templateId,
      election,
      precincts,
      ballotStyles
    );
    for (const props of propLists) {
      expect(props.compact).toBeUndefined();
    }
  }

  const compactTemplates: BallotTemplateId[] = [
    'NhBallotCompact',
    'NhBallotV3Compact',
  ];
  for (const templateId of compactTemplates) {
    const propLists = createBallotPropsForTemplate(
      templateId,
      election,
      precincts,
      ballotStyles
    );
    for (const props of propLists) {
      expect(props.compact).toEqual(true);
    }
  }
});
