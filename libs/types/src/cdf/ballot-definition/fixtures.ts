import {
  BallotDefinition,
  ElectionType,
  IdentifierType,
  ReportingUnitType,
  BallotDefinitionVersion,
  MeasurementUnitType,
  OrientationType,
  SelectionCaptureMethod,
  BallotSideType,
} from '.';
import { LanguageCode } from '../../language_code';
import { BallotPaperSize, DistrictId, Election, PartyId } from '../../election';

/**
 * For testing a round trip from VXF -> CDF -> VXF, we need to normalize a few
 * less strict parts of VXF to match stricter CDF constraints.
 */
export function normalizeVxf(vxfElection: Election): Election {
  const dateWithoutTime = new Date(vxfElection.date.split('T')[0]);
  const isoDateString = `${dateWithoutTime.toISOString().split('.')[0]}Z`;
  return {
    ...vxfElection,
    date: isoDateString,
  };
}

export const testVxfElection: Election = {
  type: 'general',
  title: 'Lincoln Municipal General Election',
  state: 'State of Hamilton',
  county: {
    id: 'county-1',
    name: 'Franklin County',
  },
  date: '2021-06-06T00:00:00Z',
  seal: '<svg>test seal</svg>',
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
      termDescription: '1 year',
    },
    {
      id: 'contest-2',
      districtId: 'district-1' as DistrictId,
      type: 'yesno',
      title: 'Proposition 1',
      description: 'Should we do this thing?',
      yesOption: {
        id: 'contest-2-option-yes',
        label: 'Yes',
      },
      noOption: {
        id: 'contest-2-option-no',
        label: 'No',
      },
    },
    {
      id: 'contest-3',
      districtId: 'district-2' as DistrictId,
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
    {
      id: 'district-2' as DistrictId,
      name: 'City of Washington',
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
    // Simulate a split precinct with two ballot styles for the same precinct
    {
      id: '1_en',
      precincts: ['precinct-1'],
      districts: ['district-1' as DistrictId],
      languages: [LanguageCode.ENGLISH],
    },
    {
      id: '2_en',
      precincts: ['precinct-1'],
      districts: ['district-2' as DistrictId],
      languages: [LanguageCode.ENGLISH],
    },
    {
      id: '3_en_es-US',
      precincts: ['precinct-2'],
      districts: ['district-1' as DistrictId, 'district-2' as DistrictId],
      languages: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    },
  ],
  ballotLayout: {
    paperSize: BallotPaperSize.Letter,
    metadataEncoding: 'qr-code',
  },
  gridLayouts: [
    {
      ballotStyleId: '1_en',
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 9,
        top: 1,
      },
      gridPositions: [
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 12,
          optionId: 'candidate-1',
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 14,
          optionId: 'candidate-2',
        },
        {
          type: 'write-in',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 16,
          writeInIndex: 0,
          writeInArea: {
            x: 2.5,
            y: 15,
            width: 3,
            height: 1,
          },
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-2',
          column: 2,
          row: 21,
          optionId: 'contest-2-option-yes',
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-2',
          column: 2,
          row: 22,
          optionId: 'contest-2-option-no',
        },
      ],
    },
    {
      ballotStyleId: '2_en',
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 9,
        top: 1,
      },
      gridPositions: [
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-3',
          column: 2,
          row: 12,
          optionId: 'candidate-3',
        },
      ],
    },
    {
      ballotStyleId: '3_en_es-US',
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 9,
        top: 1,
      },
      gridPositions: [
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 12,
          optionId: 'candidate-1',
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 14,
          optionId: 'candidate-2',
        },
        {
          type: 'write-in',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-1',
          column: 2,
          row: 16,
          writeInIndex: 0,
          writeInArea: {
            x: 2.5,
            y: 15,
            width: 3,
            height: 1,
          },
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-2',
          column: 2,
          row: 21,
          optionId: 'contest-2-option-yes',
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-2',
          column: 2,
          row: 22,
          optionId: 'contest-2-option-no',
        },
        {
          type: 'option',
          sheetNumber: 1,
          side: 'front',
          contestId: 'contest-3',
          column: 12,
          row: 12,
          optionId: 'candidate-3',
        },
      ],
    },
  ],
};

export const testCdfBallotDefinition: BallotDefinition = {
  '@type': 'BallotDefinition.BallotDefinition',

  Office: [
    {
      '@type': 'BallotDefinition.Office',
      '@id': 'office-contest-1',
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Mayor',
          },
        ],
      },
      Term: {
        '@type': 'BallotDefinition.Term',
        Label: '1 year',
      },
    },
  ],

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
              '@id': 'contest-1-option-candidate-1',
              CandidateIds: ['candidate-1'],
              EndorsementPartyIds: ['party-1'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'contest-1-option-candidate-2',
              CandidateIds: ['candidate-2'],
              EndorsementPartyIds: ['party-2'],
            },
            {
              '@type': 'BallotDefinition.CandidateOption',
              '@id': 'contest-1-option-write-in-1',
              IsWriteIn: true,
            },
          ],
          OfficeIds: ['office-contest-1'],
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
              '@id': 'contest-2-option-yes',
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
              '@id': 'contest-2-option-no',
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
          ElectionDistrictId: 'district-2',
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
              '@id': 'contest-3-option-candidate-3',
              CandidateIds: ['candidate-3'],
            },
          ],
        },
      ],

      // Definition of ballot styles
      BallotStyle: [
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1-split-1'],
          OrderedContent: [
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-1',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-candidate-1',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 12,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-candidate-2',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 14,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-write-in-0',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 16,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                      WriteInPosition: [
                        {
                          '@type': 'BallotDefinition.WriteInPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          H: 1,
                          W: 3,
                          X: 2.5,
                          Y: 15,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-2',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-2-option-yes',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 21,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-2-option-no',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 22,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: '1_en',
            },
          ],
          Language: [LanguageCode.ENGLISH],
        },
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-1-split-2'],
          OrderedContent: [
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-3',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-3-option-candidate-3',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 12,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: '2_en',
            },
          ],
          Language: [LanguageCode.ENGLISH],
        },
        {
          '@type': 'BallotDefinition.BallotStyle',
          GpUnitIds: ['precinct-2'],
          OrderedContent: [
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-1',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-candidate-1',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 12,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-candidate-2',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 14,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-1-option-write-in-0',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 16,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                      WriteInPosition: [
                        {
                          '@type': 'BallotDefinition.WriteInPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          H: 1,
                          W: 3,
                          X: 2.5,
                          Y: 15,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-2',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-2-option-yes',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 21,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-2-option-no',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 2,
                          Y: 22,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              '@type': 'BallotDefinition.OrderedContest',
              ContestId: 'contest-3',
              Physical: [
                {
                  '@type': 'BallotDefinition.PhysicalContest',
                  BallotFormatId: 'ballot-format',
                  vxOptionBoundsFromTargetMark: {
                    bottom: 1,
                    left: 1,
                    right: 9,
                    top: 1,
                  },
                  PhysicalContestOption: [
                    {
                      '@type': 'BallotDefinition.PhysicalContestOption',
                      ContestOptionId: 'contest-3-option-candidate-3',
                      OptionPosition: [
                        {
                          '@type': 'BallotDefinition.OptionPosition',
                          Sheet: 1,
                          Side: BallotSideType.Front,
                          X: 12,
                          Y: 12,
                          H: 0,
                          W: 0,
                          NumberVotes: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          ExternalIdentifier: [
            {
              '@type': 'BallotDefinition.ExternalIdentifier',
              Type: IdentifierType.StateLevel,
              Value: '3_en_es-US',
            },
          ],
          Language: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
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
            Content: 'Democratic Party',
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
      vxBallotLabel: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Democrat',
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
            Content: 'Republican Party',
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
      vxBallotLabel: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'Republican',
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
      ComposingGpUnitIds: ['district-1', 'district-2'],
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
      ComposingGpUnitIds: ['precinct-1-split-1', 'precinct-2'],
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'district-2',
      Type: ReportingUnitType.Other,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'City of Washington',
          },
        ],
      },
      ComposingGpUnitIds: ['precinct-1-split-2', 'precinct-2'],
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
      ComposingGpUnitIds: ['precinct-1-split-1', 'precinct-1-split-2'],
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
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-1-split-1',
      Type: ReportingUnitType.SplitPrecinct,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'North Lincoln - Split 1',
          },
        ],
      },
    },
    {
      '@type': 'BallotDefinition.ReportingUnit',
      '@id': 'precinct-1-split-2',
      Type: ReportingUnitType.SplitPrecinct,
      Name: {
        '@type': 'BallotDefinition.InternationalizedText',
        Text: [
          {
            '@type': 'BallotDefinition.LanguageString',
            Language: 'en',
            Content: 'North Lincoln - Split 2',
          },
        ],
      },
    },
  ],

  BallotFormat: [
    {
      '@id': 'ballot-format',
      '@type': 'BallotDefinition.BallotFormat',
      ExternalIdentifier: [
        {
          '@type': 'BallotDefinition.ExternalIdentifier',
          Type: IdentifierType.Other,
          Value: 'ballot-format',
        },
      ],
      LongEdge: 11,
      MeasurementUnit: MeasurementUnitType.In,
      Orientation: OrientationType.Portrait,
      SelectionCaptureMethod: SelectionCaptureMethod.Omr,
      ShortEdge: 8.5,
    },
  ],

  vxSeal: '<svg>test seal</svg>',

  GeneratedDate: '2021-06-06T00:00:00Z',
  Issuer: 'VotingWorks',
  IssuerAbbreviation: 'VX',
  VendorApplicationId: 'VxSuite',
  Version: BallotDefinitionVersion.v1_0_0,
  SequenceStart: 1,
  SequenceEnd: 1,
};
