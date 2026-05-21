import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BallotType,
  BaseBallotProps,
  ElectionStringKey,
  hasSplits,
  Precinct,
  UiStringsPackage,
} from '@votingworks/types';
import { TestLanguageCode } from '@votingworks/test-utils';
import { expect, test } from 'vitest';
import {
  assert,
  assertDefined,
  deepEqual,
  find,
  iter,
} from '@votingworks/basics';
import { NhBallotProps, NhStateBallotProps } from '@votingworks/hmpb';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from './ballots';

const election = readElectionGeneral();

test('createBallotPropsForTemplate', () => {
  const vxDefaultBallotProps = createBallotPropsForTemplate(
    'VxDefaultBallot',
    election,
    false
  ) as BaseBallotProps[];
  for (const props of vxDefaultBallotProps) {
    expect(props.compact).toEqual(false);
  }

  const msBallotProps = createBallotPropsForTemplate(
    'MsBallot',
    election,
    false
  );
  expect(msBallotProps).toEqual(vxDefaultBallotProps);

  const nhBallotProps = createBallotPropsForTemplate(
    'NhBallot',
    election,
    true
  ) as NhBallotProps[];
  assert(election.precincts.some((p) => hasSplits(p)));
  for (const props of nhBallotProps) {
    expect(props.compact).toEqual(true);
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (hasSplits(precinct)) {
      expect('electionTitleOverride' in props).toEqual(true);
      expect('electionSealOverride' in props).toEqual(true);
      expect('clerkSignatureImage' in props).toEqual(true);
      expect('clerkSignatureCaption' in props).toEqual(true);
    }
  }

  const nhStateBallotProps: NhStateBallotProps[] = createBallotPropsForTemplate(
    'NhStateBallot',
    election,
    false
  );
  const [allFooProps, allRegularProps] = iter(nhStateBallotProps).partition(
    (props) => props.isFederalOfficeOnly
  );
  for (const regularProps of allRegularProps) {
    const matchingFooProps = allFooProps.find((fooProps) =>
      deepEqual(fooProps, { ...regularProps, isFederalOfficeOnly: true })
    );
    if (
      regularProps.ballotMode === 'official' &&
      regularProps.ballotType === BallotType.Absentee
    ) {
      expect(matchingFooProps).toBeDefined();
    } else {
      expect(matchingFooProps).toBeUndefined();
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
          districtIds: ['district_a'],
          id: 'split-1',
          name: 'Split Name',
          electionTitleOverride: 'election title override',
          electionSealOverride: '<svg class="somesvg"></svg>',
          clerkSignatureImage: '<svg class="someothersvg"></svg>',
        },
      ],
    },
  ];
  const ballotMeasureContest = find(
    election.contests,
    (contest) => contest.type === 'yesno'
  );
  const contests = election.contests.map((c) =>
    c.id === ballotMeasureContest.id
      ? {
          ...c,
          additionalOptions: [
            {
              id: 'additional-option-1',
              label: 'Additional Option 1',
            },
          ],
        }
      : c
  );
  const formattedElection = formatElectionForExport(
    { ...election, contests, precincts: testPrecincts },
    testTranslations
  );
  expect(formattedElection).toHaveProperty('additionalHashInput');
  const hashInput = assertDefined(formattedElection.additionalHashInput);
  expect(hashInput['precinctSplitSeals']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['precinctSplitSignatureImages']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(
    hashInput['contestDescriptionsForContestsWithAdditionalOptions']
  ).toEqual({
    [ballotMeasureContest.id]: ballotMeasureContest.description,
  });
});
