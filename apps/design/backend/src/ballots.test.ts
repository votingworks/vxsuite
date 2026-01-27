import { readElectionGeneral } from '@votingworks/fixtures';
import {
  ContestSectionHeaders,
  DistrictId,
  ElectionStringKey,
  hasSplits,
  Precinct,
  UiStringsPackage,
} from '@votingworks/types';
import { TestLanguageCode } from '@votingworks/test-utils';
import { expect, test } from 'vitest';
import { assert, assertDefined, find } from '@votingworks/basics';
import { NhBallotProps } from '@votingworks/hmpb';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from './ballots';

const election = readElectionGeneral();

const contestSectionHeaders: ContestSectionHeaders = {
  candidate: {
    title: 'Candidates',
    description: 'Select your candidates',
  },
  yesno: undefined,
};

test('createBallotPropsForTemplate', () => {
  const vxDefaultBallotProps = createBallotPropsForTemplate(
    'VxDefaultBallot',
    election,
    false,
    contestSectionHeaders
  );
  for (const props of vxDefaultBallotProps) {
    expect(props.compact).toEqual(false);
  }

  const msBallotProps = createBallotPropsForTemplate(
    'MsBallot',
    election,
    false,
    contestSectionHeaders
  );
  expect(msBallotProps).toEqual(vxDefaultBallotProps);

  const nhBallotProps = createBallotPropsForTemplate(
    'NhBallot',
    election,
    true,
    contestSectionHeaders
  ) as NhBallotProps[];
  assert(election.precincts.some((p) => hasSplits(p)));
  for (const props of nhBallotProps) {
    expect(props.compact).toEqual(true);
    expect(props.contestSectionHeaders).toEqual(contestSectionHeaders);
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (hasSplits(precinct)) {
      expect('electionTitleOverride' in props).toEqual(true);
      expect('electionSealOverride' in props).toEqual(true);
      expect('clerkSignatureImage' in props).toEqual(true);
      expect('clerkSignatureCaption' in props).toEqual(true);
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
    { ...election, precincts: testPrecincts },
    testTranslations,
    contestSectionHeaders
  );
  expect(formattedElection).toHaveProperty('additionalHashInput');
  const hashInput = assertDefined(formattedElection.additionalHashInput);
  expect(hashInput['precinctSplitSeals']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['precinctSplitSignatureImages']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['contestSectionHeaders']).toEqual(contestSectionHeaders);
});
