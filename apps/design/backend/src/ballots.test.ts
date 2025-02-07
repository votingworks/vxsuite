import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import {
  DistrictId,
  Election,
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
} from '@votingworks/types';
import { TestLanguageCode } from '@votingworks/test-utils';
import { BallotTemplateId } from '@votingworks/hmpb';
import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from './ballots';
import { Precinct, UsState } from './types';

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

test('formatElectionForExport', () => {
  const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = TestLanguageCode;
  const testTranslations: UiStringsPackage = {
    [CHINESE_SIMPLIFIED]: { [ElectionStringKey.BALLOT_LANGUAGE]: '简体中文' },
    [ENGLISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'English' },
    [SPANISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'Español' },
  };
  const testPrecincts: Precinct[] = [
    {
      id: 'precinct-1',
      name: 'Precinct One',
      splits: [
        {
          districtIds: ['district_a' as DistrictId],
          id: 'split-1',
          name: 'Split Name',
          electionTitleOverride: 'election title override',
          electionSealOverride: '<svg class="somesvg"></svg>',
          clerkSignatureImage: '<svg class="someothersvg"></svg>',
        },
      ],
    },
  ];

  const formattedElection = formatElectionForExport(
    election,
    testTranslations,
    testPrecincts
  );
  expect(formattedElection).toHaveProperty('additionalHashInput');
  const hashInput = assertDefined(formattedElection.additionalHashInput);
  expect(hashInput['precinctSplitSeals']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['precinctSplitSignatureImages']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
});
