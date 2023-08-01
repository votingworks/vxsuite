import {
  CountItemType,
  ElectionReport,
  ReportDetailLevel,
  ReportingUnitType,
  ResultsStatus,
} from '.';
import { ElectionType } from '../ballot-definition';

export const electionResultsReport: ElectionReport = {
  '@type': 'ElectionResults.ElectionReport',
  IsTest: false,
  Issuer: 'Sample County',
  IssuerAbbreviation: 'SA',
  VendorApplicationId: 'VotingWorks VxAdmin 1.0.2',
  GeneratedDate: '2020-11-04T00:00:00Z',
  SequenceStart: 1,
  SequenceEnd: 1,
  Status: ResultsStatus.UnofficialComplete,
  GpUnit: [
    {
      '@id': 'sample-county',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.County,
      ComposingGpUnitIds: ['precinct-1', 'precinct-2'],
    },
    {
      '@id': 'precinct-1',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.Precinct,
      ComposingGpUnitIds: ['precinct-1-1M', 'precinct-1-2F'],
    },
    {
      '@id': 'precinct-1-1M',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.SplitPrecinct,
    },
    {
      '@id': 'precinct-1-2F',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.SplitPrecinct,
    },
    {
      '@id': 'precinct-2',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.Precinct,
      ComposingGpUnitIds: ['precinct-2-1M', 'precinct-2-2F'],
    },
    {
      '@id': 'precinct-2-1M',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.SplitPrecinct,
    },
    {
      '@id': 'precinct-2-2F',
      '@type': 'ElectionResults.ReportingUnit',
      Type: ReportingUnitType.SplitPrecinct,
    },
  ],
  Format: ReportDetailLevel.PrecinctLevel,
  Party: [
    {
      '@type': 'ElectionResults.Party',
      '@id': '0',
      Name: {
        '@type': 'ElectionResults.InternationalizedText',
        Label: 'Mammal',
        Text: [
          {
            '@type': 'ElectionResults.LanguageString',
            Language: 'en',
            Content: 'Mammal',
          },
        ],
      },
    },
    {
      '@type': 'ElectionResults.Party',
      '@id': '1',
      Name: {
        '@type': 'ElectionResults.InternationalizedText',
        Label: 'Fish',
        Text: [
          {
            '@type': 'ElectionResults.LanguageString',
            Language: 'en',
            Content: 'Fish',
          },
        ],
      },
    },
  ],
  Election: [
    {
      '@type': 'ElectionResults.Election',
      Name: {
        '@type': 'ElectionResults.InternationalizedText',
        Label: 'Example Primary Election',
        Text: [
          {
            '@type': 'ElectionResults.LanguageString',
            Language: 'en',
            Content: 'Example Primary Election',
          },
        ],
      },
      ElectionScopeId: 'sample-county',
      Type: ElectionType.Primary,
      StartDate: '2020-11-03T00:00:00Z',
      EndDate: '2020-11-03T00:00:00Z',
      BallotCounts: [
        {
          '@type': 'ElectionResults.BallotCounts',
          Type: CountItemType.Absentee,
          BallotsCast: 52,
          GpUnitId: 'precinct-1',
        },
        {
          '@type': 'ElectionResults.BallotCounts',
          Type: CountItemType.ElectionDay,
          BallotsCast: 52,
          GpUnitId: 'precinct-1',
        },
        {
          '@type': 'ElectionResults.BallotCounts',
          Type: CountItemType.Absentee,
          BallotsCast: 52,
          GpUnitId: 'precinct-2',
        },
        {
          '@type': 'ElectionResults.BallotCounts',
          Type: CountItemType.ElectionDay,
          BallotsCast: 52,
          GpUnitId: 'precinct-2',
        },
      ],
      Candidate: [
        {
          '@type': 'ElectionResults.Candidate',
          '@id': 'horse',
          BallotName: {
            '@type': 'ElectionResults.InternationalizedText',
            Label: 'Horse',
            Text: [
              {
                '@type': 'ElectionResults.LanguageString',
                Language: 'en',
                Content: 'Horse',
              },
            ],
          },
          PartyId: '0',
        },
        {
          '@type': 'ElectionResults.Candidate',
          '@id': 'fox',
          BallotName: {
            '@type': 'ElectionResults.InternationalizedText',
            Label: 'Fox',
            Text: [
              {
                '@type': 'ElectionResults.LanguageString',
                Language: 'en',
                Content: 'Fox',
              },
            ],
          },
          PartyId: '0',
        },
        {
          '@type': 'ElectionResults.Candidate',
          '@id': 'otter',
          BallotName: {
            '@type': 'ElectionResults.InternationalizedText',
            Label: 'Otter',
            Text: [
              {
                '@type': 'ElectionResults.LanguageString',
                Language: 'en',
                Content: 'Otter',
              },
            ],
          },
          PartyId: '0',
        },
      ],
      Contest: [
        {
          '@id': 'best-animal-mammal',
          '@type': 'ElectionResults.CandidateContest',
          Name: 'Best Animal Mammal',
          VotesAllowed: 1,
          PrimaryPartyIds: ['0'],
          BallotTitle: {
            '@type': 'ElectionResults.InternationalizedText',
            Label: 'Best Animal Mammal',
            Text: [
              {
                '@type': 'ElectionResults.LanguageString',
                Language: 'en',
                Content: 'Best Animal Mammal',
              },
            ],
          },
          ElectionDistrictId: 'sample-county',
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'horse',
              CandidateIds: ['horse'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 12,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 12,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 12,
                  GpUnitId: 'precinct-2',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 12,
                  GpUnitId: 'precinct-2',
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'otter',
              CandidateIds: ['otter'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 8,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 8,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 8,
                  GpUnitId: 'precinct-2',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 8,
                  GpUnitId: 'precinct-2',
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'fox',
              CandidateIds: ['fox'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 8,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 8,
                  GpUnitId: 'precinct-1',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.Absentee,
                  Count: 8,
                  GpUnitId: 'precinct-2',
                },
                {
                  '@type': 'ElectionResults.VoteCounts',
                  Type: CountItemType.ElectionDay,
                  Count: 8,
                  GpUnitId: 'precinct-2',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
