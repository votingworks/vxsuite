import { LanguageCode } from '@votingworks/types';
import type {
  ContestSpec,
  DistrictLayer,
  ElectionSpec,
} from './generate_election.ts';

const RETENTION_WORDS = 15;
const QUESTION_WORDS = 40;

const SHAWNEE_COUNTY_PARTISAN: readonly ContestSpec[] = [
  {
    kind: 'candidate',
    title: 'United States Senator',
    partisan: true,
    candidates: 3,
  },
  {
    kind: 'candidate',
    title: 'Governor and Lieutenant Governor',
    partisan: true,
    candidates: 3,
  },
  { kind: 'candidate', title: 'Secretary of State', partisan: true },
  { kind: 'candidate', title: 'Attorney General', partisan: true },
  { kind: 'candidate', title: 'Sheriff', partisan: true },
];

const COUNTY_QUESTION: ContestSpec = {
  kind: 'yesno',
  title: 'County Question 1',
  descriptionWords: QUESTION_WORDS,
};

function shawneeLayers(type: 'general' | 'primary'): DistrictLayer[] {
  const general = type === 'general';
  return [
    {
      name: 'Shawnee County',
      districtCount: 1,
      contests: [
        ...SHAWNEE_COUNTY_PARTISAN,
        ...(general
          ? ([
              {
                kind: 'yesno',
                title: 'Retain Supreme Court Justice A',
                descriptionWords: RETENTION_WORDS,
              },
              {
                kind: 'yesno',
                title: 'Retain Court of Appeals Judge',
                descriptionWords: RETENTION_WORDS,
              },
            ] as const)
          : []),
        COUNTY_QUESTION,
      ],
    },
    {
      name: 'Congressional',
      districtCount: 2,
      contests: [
        {
          kind: 'candidate',
          title: 'U.S. Representative',
          partisan: true,
          candidates: 3,
        },
      ],
    },
    {
      name: 'State Senate',
      districtCount: 4,
      contests: [{ kind: 'candidate', title: 'State Senator', partisan: true }],
    },
    {
      name: 'State House',
      districtCount: 8,
      contests: [
        { kind: 'candidate', title: 'State Representative', partisan: true },
      ],
    },
    {
      name: 'County Commission',
      districtCount: 5,
      contests: [
        { kind: 'candidate', title: 'County Commissioner', partisan: true },
      ],
    },
    {
      name: 'Unified School',
      districtCount: 6,
      contests: general
        ? [
            {
              kind: 'candidate',
              title: 'Board of Education',
              seats: 2,
              candidates: 4,
            },
            {
              kind: 'yesno',
              title: 'School Bond Question',
              descriptionWords: QUESTION_WORDS,
              firstDistricts: 2,
            },
          ]
        : [],
    },
    {
      name: 'City',
      districtCount: 8,
      coverage: 0.8,
      contests: general
        ? [
            {
              kind: 'candidate',
              title: 'City Council',
              seats: 2,
              candidates: 4,
            },
            {
              kind: 'yesno',
              title: 'City Question',
              descriptionWords: QUESTION_WORDS,
              firstDistricts: 2,
            },
          ]
        : [],
    },
  ];
}

function systemLimitLayers(): DistrictLayer[] {
  const layerContests: ContestSpec[] = [
    { kind: 'candidate', title: 'Commissioner', partisan: true },
    { kind: 'candidate', title: 'Trustee' },
  ];
  return [
    {
      name: 'County',
      districtCount: 1,
      contests: [
        { kind: 'candidate', title: 'Governor', partisan: true, candidates: 6 },
        { kind: 'candidate', title: 'Senator', partisan: true, candidates: 2 },
        { kind: 'yesno', title: 'County Measure 1', descriptionWords: 30 },
        { kind: 'yesno', title: 'County Measure 2', descriptionWords: 30 },
      ],
    },
    ...(
      [
        ['Region', 20],
        ['Area', 50],
        ['Zone', 100],
        ['Ward', 150],
        ['Subdistrict', 178],
      ] as const
    ).map(([name, districtCount]) => ({
      name,
      districtCount,
      contests: layerContests,
    })),
  ];
}

function santaClaraLayers(): DistrictLayer[] {
  return [
    {
      name: 'Santa Clara County',
      districtCount: 1,
      contests: [
        { kind: 'candidate', title: 'County Assessor', candidates: 3 },
        { kind: 'yesno', title: 'Measure A', descriptionWords: 50 },
        { kind: 'yesno', title: 'Measure B', descriptionWords: 50 },
        { kind: 'yesno', title: 'Measure C', descriptionWords: 50 },
      ],
    },
    {
      name: 'Congressional',
      districtCount: 5,
      contests: [
        {
          kind: 'candidate',
          title: 'U.S. Representative',
          partisan: true,
          candidates: 3,
        },
      ],
    },
    {
      name: 'Assembly',
      districtCount: 6,
      contests: [
        {
          kind: 'candidate',
          title: 'Member of the State Assembly',
          partisan: true,
        },
      ],
    },
    {
      name: 'Supervisorial',
      districtCount: 5,
      contests: [
        {
          kind: 'candidate',
          title: 'Member, Board of Supervisors',
          candidates: 3,
        },
      ],
    },
    {
      name: 'City',
      districtCount: 15,
      coverage: 0.85,
      contests: [
        { kind: 'yesno', title: 'City Measure', descriptionWords: 50 },
      ],
    },
    {
      name: 'School',
      districtCount: 30,
      coverage: 0.9,
      contests: [
        {
          kind: 'yesno',
          title: 'School Parcel Tax Measure',
          descriptionWords: 50,
        },
      ],
    },
    {
      name: 'Water',
      districtCount: 20,
      coverage: 0.5,
      contests: [
        { kind: 'candidate', title: 'Water District Director', candidates: 3 },
      ],
    },
  ];
}

const ENGLISH_ONLY = [[LanguageCode.ENGLISH]] as const;

export const ELECTION_PRESETS = {
  'shawnee-general': {
    name: 'shawnee-general',
    title: 'Shawnee-Scale General Election',
    type: 'general',
    precincts: 242,
    districtSets: 204,
    pollingPlaces: 87,
    layers: shawneeLayers('general'),
    languageConfigs: ENGLISH_ONLY,
  },
  'shawnee-primary': {
    name: 'shawnee-primary',
    title: 'Shawnee-Scale Closed Primary Election',
    type: 'primary',
    precincts: 242,
    districtSets: 204,
    pollingPlaces: 87,
    layers: shawneeLayers('primary'),
    languageConfigs: ENGLISH_ONLY,
  },
  'system-limit': {
    name: 'system-limit',
    title: 'System Limit General Election',
    type: 'general',
    precincts: 2500,
    districtSets: 5000,
    splitsPerPrecinct: 2,
    pollingPlaces: 900,
    layers: systemLimitLayers(),
    languageConfigs: ENGLISH_ONLY,
  },
  'santa-clara': {
    name: 'santa-clara',
    title: 'Santa Clara-Scale Special Election',
    type: 'general',
    precincts: 1067,
    districtSets: 1067,
    pollingPlaces: 300,
    layers: santaClaraLayers(),
    languageConfigs: [
      [LanguageCode.ENGLISH],
      [LanguageCode.ENGLISH, LanguageCode.SPANISH],
      [LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED],
      [LanguageCode.ENGLISH, LanguageCode.CHINESE_TRADITIONAL],
      [LanguageCode.ENGLISH, LanguageCode.ARABIC],
      [LanguageCode.ENGLISH, LanguageCode.BENGALI],
    ],
  },
} as const satisfies Record<string, ElectionSpec>;

export type ElectionPresetName = keyof typeof ELECTION_PRESETS;

export function isElectionPresetName(name: string): name is ElectionPresetName {
  return name in ELECTION_PRESETS;
}

/**
 * Scales a preset to `precincts` precincts, keeping its ratios of district
 * sets and polling places to precincts.
 */
export function scaleSpec(
  spec: ElectionSpec,
  precincts?: number
): ElectionSpec {
  if (precincts === undefined || precincts === spec.precincts) return spec;
  const ratio = precincts / spec.precincts;
  return {
    ...spec,
    name: `${spec.name}-p${precincts}`,
    precincts,
    districtSets: Math.max(1, Math.round(spec.districtSets * ratio)),
    pollingPlaces: Math.max(1, Math.round(spec.pollingPlaces * ratio)),
  };
}
