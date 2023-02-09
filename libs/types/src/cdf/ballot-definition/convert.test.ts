import {
  BallotDefinition,
  BallotDefinitionVersion,
  ElectionType,
  IdentifierType,
  ReportingUnitType,
} from '.';
import { DistrictId, Election, PartyId } from '../../election';
import {
  convertCdfBallotDefinitionToVxfElection,
  convertVxfElectionToCdfBallotDefinition,
} from './convert';

const mockNow = '2023-02-08T00:00:00Z';
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(mockNow));
});

const testVxfElection: Election = {
  title: 'Lincoln Municipal General Election',
  state: 'State of Hamilton',
  county: {
    id: 'county-1',
    name: 'Franklin County',
  },
  date: '2021-06-06T00:00:00Z',
  parties: [
    {
      id: 'party-1' as PartyId,
      name: 'Democrat',
      fullName: 'Democratic Party',
      abbrev: 'D',
    },
    {
      id: 'party-2' as PartyId,
      name: 'Republican',
      fullName: 'Republican Party',
      abbrev: 'R',
    },
  ],
  contests: [
    {
      id: 'contest-1',
      districtId: 'district-1' as DistrictId,
      type: 'candidate',
      title: 'Mayor',
      seats: 1,
      allowWriteIns: true,
      candidates: [
        {
          id: 'candidate-1',
          name: 'Sherlock Holmes',
          partyIds: ['party-1' as PartyId],
        },
        {
          id: 'candidate-2',
          name: 'Thomas Edison',
          partyIds: ['party-2' as PartyId],
        },
      ],
    },
    {
      id: 'contest-2',
      districtId: 'district-1' as DistrictId,
      type: 'yesno',
      title: 'Proposition 1',
      description: 'Should we do this thing?',
      yesOption: {
        id: 'option-yes',
        label: 'Yes',
      },
      noOption: {
        id: 'option-no',
        label: 'No',
      },
    },
    {
      id: 'contest-3',
      districtId: 'district-1' as DistrictId,
      type: 'candidate',
      title: 'Controller',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        {
          id: 'candidate-3',
          name: 'Winston Churchill',
        },
      ],
    },
  ],
  districts: [
    {
      id: 'district-1' as DistrictId,
      name: 'City of Lincoln',
    },
  ],
  precincts: [
    {
      id: 'precinct-1',
      name: 'North Lincoln',
    },
    {
      id: 'precinct-2',
      name: 'South Lincoln',
    },
  ],
  ballotStyles: [
    // Party-specific ballot styles
    {
      id: 'ballot-style-1',
      precincts: ['precinct-1', 'precinct-2'],
      districts: ['district-1' as DistrictId],
      partyId: 'party-1' as PartyId,
    },
    {
      id: 'ballot-style-2',
      precincts: ['precinct-1', 'precinct-2'],
      districts: ['district-1' as DistrictId],
      partyId: 'party-2' as PartyId,
    },
    // Simulate a split precinct with two ballot styles for the same precinct
    {
      id: 'ballot-style-3',
      precincts: ['precinct-1'],
      districts: ['district-1' as DistrictId],
    },
    {
      id: 'ballot-style-4',
      precincts: ['precinct-1'],
      districts: ['district-1' as DistrictId],
    },
  ],
};

export const testCdfBallotDefinition: BallotDefinition = {
  '@type': 'BallotDefinition.BallotDefinition',

  Election: [
    {
      '@type': 'BallotDefinition.Election',
      ElectionScopeId: 'state-of-hamilton',
      StartDate: '2021-06-06',
      EndDate: '2021-06-06',
      Type: ElectionType.General,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Lincoln Municipal General Election',
          },
        ],
      },

      Candidate: [
        {
          '@type': 'BallotDefinition.Candidate',
          '@id': 'candidate-1',
          BallotName: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Sherlock Holmes',
              },
            ],
          },
        },
        {
          '@type': 'BallotDefinition.Candidate',
          '@id': 'candidate-2',
          BallotName: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Thomas Edison',
              },
            ],
          },
        },
        {
          '@type': 'BallotDefinition.Candidate',
          '@id': 'candidate-3',
          BallotName: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Winston Churchill',
              },
            ],
          },
        },
      ],

      Contest: [
        {
          '@type': 'BallotDefinition.CandidateContest',
          '@id': 'contest-1',
          ElectionDistrictId: 'district-1',
          Name: 'Mayor',
          BallotTitle: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Mayor',
              },
            ],
          },
          VotesAllowed: 1,
          ContestOption: [
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'option-candidate-1',
              CandidateIds: ['candidate-1'],
              EndorsementPartyIds: ['party-1'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'option-candidate-2',
              CandidateIds: ['candidate-2'],
              EndorsementPartyIds: ['party-2'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'option-write-in-1',
              IsWriteIn: true,
            },
          ],
        },
        {
          '@type': 'BallotDefinition.BallotMeasureContest',
          '@id': 'contest-2',
          ElectionDistrictId: 'district-1',
          Name: 'Proposition 1',
          BallotTitle: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Proposition 1',
              },
            ],
          },
          FullText: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Should we do this thing?',
              },
            ],
          },
          ContestOption: [
            {
              '@type': 'BallotDefinition.BallotMeasureOption',
              '@id': 'option-yes',
              Selection: {
                '@type': 'BallotDefinition.InternationalizedText',
                Text: [
                  {
                    '@type': 'BallotDefinition.LanguageString',
                    Language: 'en',
                    Content: 'Yes',
                  },
                ],
              },
            },
            {
              '@type': 'BallotDefinition.BallotMeasureOption',
              '@id': 'option-no',
              Selection: {
                '@type': 'BallotDefinition.InternationalizedText',
                Text: [
                  {
                    '@type': 'BallotDefinition.LanguageString',
                    Language: 'en',
                    Content: 'No',
                  },
                ],
              },
            },
          ],
        },
        {
          '@type': 'BallotDefinition.CandidateContest',
          '@id': 'contest-3',
          ElectionDistrictId: 'district-1',
          Name: 'Controller',
          BallotTitle: {
            '@type': 'BallotDefinition.InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Controller',
              },
            ],
          },
          VotesAllowed: 1,
          ContestOption: [
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'option-candidate-3',
              CandidateIds: ['candidate-3'],
            },
          ],
        },
      ],

      // Definition of ballot styles
      BallotStyle: [
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1', 'precinct-2'],
          PartyIds: ['party-1'],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: 'ballot-style-1',
            },
          ],
        },
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1', 'precinct-2'],
          PartyIds: ['party-2'],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: 'ballot-style-2',
            },
          ],
        },
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1'],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: 'ballot-style-3',
            },
          ],
        },
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1'],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: 'ballot-style-4',
            },
          ],
        },
      ],
    },
  ],

  Party: [
    {
      '@type': 'BallotDefinition.Party',
      '@id': 'party-1',
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Democrat',
          },
        ],
      },
      Abbreviation: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'D',
          },
        ],
      },
    },
    {
      '@type': 'BallotDefinition.Party',
      '@id': 'party-2',
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Republican',
          },
        ],
      },
      Abbreviation: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'R',
          },
        ],
      },
    },
  ],

  GpUnit: [
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'state-of-hamilton',
      Type: ReportingUnitType.State,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'State of Hamilton',
          },
        ],
      },
      ComposingGpUnitIds: ['county-1'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'county-1',
      Type: ReportingUnitType.County,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Franklin County',
          },
        ],
      },
      ComposingGpUnitIds: ['district-1'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'district-1',
      Type: ReportingUnitType.Other,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'City of Lincoln',
          },
        ],
      },
      ComposingGpUnitIds: ['precinct-1', 'precinct-2'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-1',
      Type: ReportingUnitType.Precinct,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'North Lincoln',
          },
        ],
      },
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-2',
      Type: ReportingUnitType.Precinct,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'South Lincoln',
          },
        ],
      },
    },
  ],

  GeneratedDate: mockNow,
  Issuer: 'VotingWorks',
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VxSuite',
  Version: BallotDefinitionVersion.v1_0_0,
  SequenceStart: 1,
  SequenceEnd: 1,
};

test('convertVxfElectionToCdfBallotDefinition', () => {
  expect(convertVxfElectionToCdfBallotDefinition(testVxfElection)).toEqual(
    testCdfBallotDefinition
  );
});

test('convertCdfBallotDefinitionToVxfElection', () => {
  expect(
    convertCdfBallotDefinitionToVxfElection(testCdfBallotDefinition)
  ).toEqual(testVxfElection);
});

// In CDF, we require an explicit yes/no contest option for every ballot measure contest.
test('convertVxfElectionToCdfBallotDefinition supplies default yes/no contest options', () => {
  expect(
    convertVxfElectionToCdfBallotDefinition({
      ...testVxfElection,
      contests: testVxfElection.contests.map((contest) =>
        contest.type === 'yesno'
          ? { ...contest, yesOption: undefined, noOption: undefined }
          : contest
      ),
    })
  ).toEqual(testCdfBallotDefinition);
});
