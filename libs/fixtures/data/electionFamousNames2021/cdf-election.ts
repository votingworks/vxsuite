const cdfElection = {
  '@type': 'BallotDefinition.BallotDefinition',

  // Definition of the election (mainly candidates, contests, and ballot styles)
  Election: [
    {
      '@type': 'BallotDefinition.Election',
      ElectionScopeId: 'state-hamilton', // The GPUnit for this election
      StartDate: '2023-02-01',
      EndDate: '2023-02-01',
      Type: 'general', // Other types: primary, runoff, special, etc.
      Name: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Lincoln Municipal General Election',
          },
        ], // Election name in other languages would go here
      },

      // Definition of all candidates in the election across contests
      Candidate: [
        {
          '@type': 'BallotDefinition.Candidate',
          '@id': 'sherlock-holmes',
          BallotName: {
            '@type': 'InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Sherlock Holmes',
              },
            ],
          },
          PartyId: 'party-0',
        },
        {
          '@type': 'BallotDefinition.Candidate',
          '@id': 'thomas-edison',
          BallotName: {
            '@type': 'InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Thomas Edison',
              },
            ],
          },
          PartyId: 'party-1',
        },
      ],

      // Definition of contests
      Contest: [
        {
          '@type': 'BallotDefinition.CandidateContest',
          '@id': 'mayor',
          ElectionDistrict: 'district-1',
          // TODO what is the analogous field for "section"?
          Name: 'Mayor', // Contest name, not for ballot
          BallotTitle: {
            // Display name for contest on ballot
            '@type': 'InternationalizedText',
            Text: [
              {
                '@type': 'BallotDefinition.LanguageString',
                Language: 'en',
                Content: 'Mayor',
              },
            ],
          },
          VotesAllowed: 1,
          // TODO there's no field analogous to "allowWriteIns" in CDF
          // Contest options reference the candidates defined above by id
          ContestOption: [
            {
              '@type': 'BallotDefinition.CandidateOption',
              CandidateIds: ['sherlock-holmes'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              CandidateIds: ['thomas-edison'],
            },
          ],
        },
      ],

      // Definition of ballot styles
      BallotStyle: [
        {
          '@type': 'BallotDefinition.BallotStyle',
          '@id': 'ballot-style-1',
          // TODO do we also reference districts here? what's the relationship between districts and precincts?
          GpUnit: ['precinct-23', 'precinct-22'],
        },
      ],
    },
  ],

  // Definition of parties
  Party: [
    {
      '@type': 'BallotDefinition.Party',
      '@id': 'party-0',
      // TODO there's no way to distinguish between "name" and "fullName"
      // This Name goes on the ballot
      Name: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Democrat',
          },
        ],
      },
      Abbreviation: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'D',
          },
        ],
      },
    },
  ],

  // Definition of "geo-political units" (e.g. states, counties, districts, precincts, etc)
  GpUnit: [
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'state-hamilton',
      Type: 'state',
      Name: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'State of Hamilton',
          },
        ],
      },
      ComposingGpUnit: ['county-franklin'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'county-franklin',
      Type: 'county',
      Name: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Franklin County',
          },
        ],
      },
      // TODO what's the relationship between counties and districts?
      ComposingGpUnit: ['district-1'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'district-1',
      Type: 'district',
      Name: {
        '@type': 'InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'District 1',
          },
        ],
      },
      ComposingGpUnit: ['precinct-23', 'precinct-22'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-23',
      Type: 'precinct',
      Name: {
        '@type': 'InternationalizedText',
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
      '@id': 'precinct-22',
      Type: 'precinct',
      Name: {
        '@type': 'InternationalizedText',
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

  // Required metadata
  GeneratedDate: '2023-01-23T00:00:00Z',
  Issuer: 'VotingWorks',
  IssuerAbbreviation: 'VX',
  VenderApplicationId: 'VxDefine', // App that generated this file
  Version: '1.0.0', // CDF version
  SequenceStart: 1, // Report number (out of a series of reports - don't think this applies for this use case but is required)
  SequenceEnd: 1, // Total number of reports in series

  // Extra fields not in CDF
  // TODO should these be specified in this file?
  VotingWorksExtras: {
    sealUrl: '/seals/state-of-hamilton-official-seal.svg',
    ballotStrings: {
      officialInitials: 'Initialing Manager',
    },
    adjudicationReasons: [
      'UninterpretableBallot',
      'Overvote',
      'Undervote',
      'BlankBallot',
    ],
    markThresholds: {
      definite: 0.12,
      marginal: 0.12,
    },
  },
};
