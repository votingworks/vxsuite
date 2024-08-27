import {
  CountItemStatus,
  CountItemType,
  ElectionReport,
  ElectionType,
  InternationalizedText,
  ReportDetailLevel,
  ResultsStatus,
} from '.';

function asInternationalizedText(text: string): InternationalizedText {
  return {
    '@type': 'ElectionResults.InternationalizedText',
    Text: [
      {
        '@type': 'ElectionResults.LanguageString',
        Language: 'en',
        Content: text,
      },
    ],
  };
}

export const testElectionReport: ElectionReport = {
  '@type': 'ElectionResults.ElectionReport',
  Issuer: 'VotingWorks',
  GeneratedDate: '2021-06-06T00:00:00Z',
  SequenceStart: 1,
  SequenceEnd: 1,
  Format: ReportDetailLevel.SummaryContest,
  Status: ResultsStatus.UnofficialComplete,
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VX',
  Election: [
    {
      '@type': 'ElectionResults.Election',
      ElectionScopeId: 'state-of-hamilton',
      StartDate: '2021-06-06',
      EndDate: '2021-06-06',
      Name: asInternationalizedText('Lincoln Municipal General Election'),
      Type: ElectionType.General,
      BallotCounts: [
        {
          '@type': 'ElectionResults.BallotCounts',
          GpUnitId: 'state-of-hamilton',
          Type: CountItemType.Total,
          BallotsCast: 100,
        },
      ],
      CountStatus: [
        {
          '@type': 'ElectionResults.CountStatus',
          Type: CountItemType.Total,
          Status: CountItemStatus.Completed,
        },
      ],
      Candidate: [
        {
          '@id': 'zebra',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Zebra'),
          PartyId: '0',
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.BallotMeasureContest',
          '@id': 'fishing',
          Name: 'Fishing Proposition',
          ElectionDistrictId: 'state-of-hamilton',
          ContestSelection: [
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-yes',
              Selection: asInternationalizedText('Yes'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 50,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-no',
              Selection: asInternationalizedText('No'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 40,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 7,
              Undervotes: 3,
            },
          ],
        },
        {
          '@type': 'ElectionResults.RetentionContest',
          '@id': 'judge',
          Name: 'Judge Retention',
          ElectionDistrictId: 'state-of-hamilton',
          CandidateId: 'zebra',
          ContestSelection: [
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'retain-yes',
              Selection: asInternationalizedText('Yes, retain'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 55,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'retain-no',
              Selection: asInternationalizedText('No, do not retain'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 35,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 6,
              Undervotes: 4,
            },
          ],
        },
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'best-animal-mammal',
          Name: 'Best Animal Mammal',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 1,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'zebra',
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 90,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 7,
              Undervotes: 3,
            },
          ],
        },
      ],
    },
  ],
};

export const testElectionReportNoOtherCounts: ElectionReport = {
  '@type': 'ElectionResults.ElectionReport',
  Issuer: 'VotingWorks',
  GeneratedDate: '2021-06-06T00:00:00Z',
  SequenceStart: 1,
  SequenceEnd: 1,
  Format: ReportDetailLevel.SummaryContest,
  Status: ResultsStatus.UnofficialComplete,
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VX',
  Election: [
    {
      '@type': 'ElectionResults.Election',
      ElectionScopeId: 'state-of-hamilton',
      StartDate: '2021-06-06',
      EndDate: '2021-06-06',
      Name: asInternationalizedText('Lincoln Municipal General Election'),
      Type: ElectionType.General,
      BallotCounts: [
        {
          '@type': 'ElectionResults.BallotCounts',
          GpUnitId: 'state-of-hamilton',
          Type: CountItemType.Total,
          BallotsCast: 100,
        },
      ],
      CountStatus: [
        {
          '@type': 'ElectionResults.CountStatus',
          Type: CountItemType.Total,
          Status: CountItemStatus.Completed,
        },
      ],
      Candidate: [
        {
          '@id': 'zebra',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Zebra'),
          PartyId: '0',
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.BallotMeasureContest',
          '@id': 'fishing',
          Name: 'Fishing Proposition',
          ElectionDistrictId: 'state-of-hamilton',
          ContestSelection: [
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-yes',
              Selection: asInternationalizedText('Yes'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 60,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-no',
              Selection: asInternationalizedText('No'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 40,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
        },
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'best-animal-mammal',
          Name: 'Best Animal Mammal',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 1,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'zebra',
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 90,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const testElectionReportUnsupportedContestType: ElectionReport = {
  '@type': 'ElectionResults.ElectionReport',
  Issuer: 'VotingWorks',
  GeneratedDate: '2021-06-06T00:00:00Z',
  SequenceStart: 1,
  SequenceEnd: 1,
  Format: ReportDetailLevel.SummaryContest,
  Status: ResultsStatus.UnofficialComplete,
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VX',
  Election: [
    {
      '@type': 'ElectionResults.Election',
      ElectionScopeId: 'state-of-hamilton',
      StartDate: '2021-06-06',
      EndDate: '2021-06-06',
      Name: asInternationalizedText('Lincoln Municipal General Election'),
      Type: ElectionType.General,
      BallotCounts: [
        {
          '@type': 'ElectionResults.BallotCounts',
          GpUnitId: 'state-of-hamilton',
          Type: CountItemType.Total,
          BallotsCast: 100,
        },
      ],
      CountStatus: [
        {
          '@type': 'ElectionResults.CountStatus',
          Type: CountItemType.Total,
          Status: CountItemStatus.Completed,
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.PartyContest',
          '@id': 'fishing-party',
          Name: 'Fishing Party',
          ElectionDistrictId: 'state-of-hamilton',
          ContestSelection: [
            {
              '@type': 'ElectionResults.PartySelection',
              '@id': 'fishing-yes',
              PartyIds: ['water-party'],
            },
          ],
        },
      ],
    },
  ],
};
