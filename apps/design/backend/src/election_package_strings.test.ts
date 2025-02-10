import { expect, test } from 'vitest';
import { DistrictId } from '@votingworks/types';
import { Precinct } from './types';
import { getUserDefinedHmpbStrings } from './election_package_strings';

test('getUserDefinedHmpbStrings', () => {
  const precincts: Precinct[] = [
    {
      id: 'precinct_1',
      name: 'Example Split Precinct',
      splits: [
        {
          districtIds: ['district_1' as DistrictId],
          id: 'split_1',
          name: 'Split One',
          clerkSignatureCaption: 'Clerk Signature',
          electionTitleOverride: 'Split One Election',
          clerkSignatureImage: '<svg></svg>',
          electionSealOverride: '<svg></svg>',
        },
        {
          districtIds: ['district_2' as DistrictId],
          id: 'split_2',
          name: 'Split Two',
          electionTitleOverride: 'Split Two Election',
        },
        {
          districtIds: ['district_3' as DistrictId],
          id: 'split_3',
          name: 'Split Three',
          clerkSignatureCaption: 'Town Clerk Signature',
        },
      ],
    },
    {
      id: 'precinct_2',
      name: 'Example Nonsplit Precinct',
      districtIds: ['district_1' as DistrictId],
    },
  ];

  expect(getUserDefinedHmpbStrings(precincts)).toEqual({
    hmpbClerkSignatureCaption_precinct_1_split_1: 'Clerk Signature',
    hmpbElectionTitleOverride_precinct_1_split_1: 'Split One Election',
    hmpbElectionTitleOverride_precinct_1_split_2: 'Split Two Election',
    hmpbClerkSignatureCaption_precinct_1_split_3: 'Town Clerk Signature',
  });
});
