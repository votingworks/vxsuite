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

/**
 * A mock ElectionReport designed to work with the ElectionGeneral mock election.
 */
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
          BallotsCast: 65,
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
          '@id': 'barchi-hallaren',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText(
            'Joseph Barchi and Joseph Hallaren'
          ),
          PartyId: '0',
        },
        {
          '@id': 'cramer-vuocolo',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Adam Cramer and Greg Vuocolo'),
          PartyId: '1',
        },
        {
          '@id': 'court-blumhardt',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Daniel Court and Amy Blumhardt'),
          PartyId: '1',
        },
        {
          '@id': 'boone-lian',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Alvin Boone and James Lian'),
          PartyId: '1',
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
                  Count: 30,
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
                  Count: 29,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 1,
              Undervotes: 5,
            },
          ],
        },
        {
          '@type': 'ElectionResults.RetentionContest',
          '@id': 'judge',
          Name: 'Judge Retention',
          ElectionDistrictId: 'state-of-hamilton',
          CandidateId: 'barchi-hallaren',
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
                  Count: 10,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 0,
              Undervotes: 0,
            },
          ],
        },
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'council',
          Name: 'Council',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 2,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'council-barchi-hallaren',
              CandidateIds: ['barchi-hallaren'],
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
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'council-cramer-vuocolo',
              CandidateIds: ['cramer-vuocolo'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 30,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'council-court-blumhardt',
              CandidateIds: ['court-blumhardt'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 25,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'council-boone-lian',
              CandidateIds: ['boone-lian'],
              IsWriteIn: true,
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 5,
                  Type: CountItemType.Total,
                },
              ],
            },
          ],
          OtherCounts: [
            {
              '@type': 'ElectionResults.OtherCounts',
              GpUnitId: 'state-of-hamilton',
              Overvotes: 8,
              Undervotes: 2,
            },
          ],
        },
      ],
    },
  ],
};

export const testElectionReportExportedFromVxAdmin: ElectionReport = {
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
          '@id': 'vx_barchi-hallaren',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText(
            'Joseph Barchi and Joseph Hallaren'
          ),
          PartyId: '0',
        },
        {
          '@id': 'vx_cramer-vuocolo',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Adam Cramer and Greg Vuocolo'),
          PartyId: '1',
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'council',
          Name: 'Council',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 1,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'vx_council-barchi-hallaren',
              CandidateIds: ['vx_barchi-hallaren'],
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
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'vx_council-cramer-vuocolo',
              CandidateIds: ['vx_cramer-vuocolo'],
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
      ],
    },
  ],
};

export const testElectionReportWriteIns: ElectionReport = {
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
          BallotsCast: 10,
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
        {
          '@id': 'ibex-01',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('IBEX'),
        },
        {
          '@id': 'ibex-02',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Ibex'),
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'best-animal-mammal',
          Name: 'Best Animal Mammal',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 1,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-zebra',
              CandidateIds: ['zebra'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 6,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-ibex-01',
              CandidateIds: ['ibex-01'],
              IsWriteIn: true,
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 1,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-ibex-02',
              CandidateIds: ['ibex-02'],
              IsWriteIn: true,
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 3,
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

/**
 * A mock ElectionReport where the specified tallies result in a non-integer
 * result for total ballots cast.
 */
export const testElectionReportInvalidBallotTotal: ElectionReport = {
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
          BallotsCast: 5,
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
        {
          '@id': 'ibex',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Ibex'),
          PartyId: '1',
        },
        {
          '@id': 'gazelle',
          '@type': 'ElectionResults.Candidate',
          BallotName: asInternationalizedText('Gazelle'),
          PartyId: '2',
        },
      ],
      Contest: [
        {
          '@type': 'ElectionResults.CandidateContest',
          '@id': 'best-animal-mammal',
          Name: 'Best Animal Mammal',
          ElectionDistrictId: 'state-of-hamilton',
          VotesAllowed: 2,
          ContestSelection: [
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-zebra',
              CandidateIds: ['zebra'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 3,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-ibex',
              CandidateIds: ['ibex'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 3,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.CandidateSelection',
              '@id': 'best-animal-mammal-gazelle',
              CandidateIds: ['gazelle'],
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 3,
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

export const testElectionReportYesNoContestWithoutTextMatch: ElectionReport = {
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
          '@type': 'ElectionResults.BallotMeasureContest',
          '@id': 'fishing',
          Name: 'Fishing Proposition',
          ElectionDistrictId: 'state-of-hamilton',
          ContestSelection: [
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-for',
              Selection: asInternationalizedText('For'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 45,
                  Type: CountItemType.Total,
                },
              ],
            },
            {
              '@type': 'ElectionResults.BallotMeasureSelection',
              '@id': 'fishing-against',
              Selection: asInternationalizedText('Against'),
              VoteCounts: [
                {
                  '@type': 'ElectionResults.VoteCounts',
                  GpUnitId: 'state-of-hamilton',
                  Count: 55,
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

export const testElectionReportYesNoContest: ElectionReport = {
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
          '@type': 'ElectionResults.BallotMeasureContest',
          '@id': 'fishing',
          Name: 'Fishing Proposition',
          ElectionDistrictId: 'state-of-hamilton',
          ContestSelection: [
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
              '@id': 'best-animal-mammal-zebra',
              CandidateIds: ['zebra'],
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
