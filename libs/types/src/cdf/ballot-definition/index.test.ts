import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BallotDefinition,
  BallotDefinitionSchema,
  BallotDefinitionVersion,
  ElectionType,
  ReportingUnitType,
} from '.';
import { mockWritable } from '../../../test/helpers/mock_writable';

const ballotDefinition: BallotDefinition = {
  '@type': 'BallotDefinition.BallotDefinition',

  // Definition of the election (mainly candidates, contests, and ballot styles)
  Election: [
    {
      '@type': 'BallotDefinition.Election',
      ElectionScopeId: 'state-hamilton', // The GPUnit for this election
      StartDate: '2023-02-01',
      EndDate: '2023-02-01',
      Type: ElectionType.General,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
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
            '@type': 'BallotDefinition.InternationalizedText',
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
            '@type': 'BallotDefinition.InternationalizedText',
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
          ElectionDistrictId: 'district-1',
          Name: 'Mayor',
          BallotTitle: {
            // Display name for contest on ballot
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
              '@id': 'option-sherlock-holmes',
              CandidateIds: ['sherlock-holmes'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'option-thomas-edison',
              CandidateIds: ['thomas-edison'],
            },
          ],
        },
      ],

      // Definition of ballot styles
      BallotStyle: [
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-23', 'precinct-22'],
        },
      ],
    },
  ],

  // Definition of parties
  Party: [
    {
      '@type': 'BallotDefinition.Party',
      '@id': 'party-0',
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
  ],

  // Definition of "geo-political units" (e.g. states, counties, districts, precincts, etc)
  GpUnit: [
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'state-hamilton',
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
      ComposingGpUnitIds: ['county-franklin'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'county-franklin',
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
      Type: ReportingUnitType.Congressional,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'District 1',
          },
        ],
      },
      ComposingGpUnitIds: ['precinct-23', 'precinct-22'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-23',
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
      '@id': 'precinct-22',
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

  // Required metadata
  GeneratedDate: '2023-01-23T00:00:00Z',
  Issuer: 'VotingWorks',
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VxDefine', // App that generated this file
  Version: BallotDefinitionVersion.v1_0_0,
  SequenceStart: 1, // Report number (out of a series of reports - don't think this applies for this use case but is required)
  SequenceEnd: 1, // Total number of reports in series
};

test('BallotDefinition', () => {
  BallotDefinitionSchema.parse(ballotDefinition);
});

test('schema in sync', () => {
  const xsd = readFileSync(
    join(__dirname, '../../../data/cdf/ballot-definition/schema.xsd'),
    'utf-8'
  );
  const json = readFileSync(
    join(__dirname, '../../../data/cdf/ballot-definition/schema.json'),
    'utf-8'
  );
  const currentOutput = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(xsd, json, out).unsafeUnwrap();
  const expectedOutput = out.toString();
  expect(currentOutput).toEqual(expectedOutput);
});
