import { assert, DateWithoutTime } from '@votingworks/basics';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { generateBallotStyles } from '@votingworks/hmpb';
import type {
  BallotLanguageConfigs,
  BallotStyleGroupId,
  Candidate,
  CandidateOrderings,
  Contest,
  District,
  DistrictId,
  Election,
  LanguageCode,
  Party,
  PollingPlace,
  Precinct,
} from '@votingworks/types';

export interface ContestSpec {
  readonly kind: 'candidate' | 'yesno';
  readonly title: string;
  readonly partisan?: boolean;
  readonly seats?: number;
  readonly candidates?: number;
  readonly descriptionWords?: number;
  readonly firstDistricts?: number;
}

export interface DistrictLayer {
  readonly name: string;
  readonly districtCount: number;
  readonly coverage?: number;
  readonly contests: readonly ContestSpec[];
}

export interface ElectionSpec {
  readonly name: string;
  readonly title: string;
  readonly type: 'general' | 'primary';
  readonly precincts: number;
  readonly districtSets: number;
  readonly splitsPerPrecinct?: number;
  readonly pollingPlaces: number;
  readonly layers: readonly DistrictLayer[];
  readonly languageConfigs: ReadonlyArray<readonly LanguageCode[]>;
}

export interface GeneratedElectionStats {
  readonly precincts: number;
  readonly splits: number;
  readonly districts: number;
  readonly contests: number;
  readonly candidates: number;
  readonly parties: number;
  readonly pollingPlaces: number;
  readonly ballotStyles: number;
  readonly languageConfigs: number;
  readonly contestsPerBallotStyle: { min: number; max: number; avg: number };
  readonly pdfsPerBallotMode: number;
}

export interface GeneratedElection {
  readonly spec: ElectionSpec;
  readonly election: Election;
  readonly candidateOrderings: Map<BallotStyleGroupId, CandidateOrderings>;
  readonly ballotLanguageConfigs: BallotLanguageConfigs;
  readonly stats: GeneratedElectionStats;
}

const FIRST_NAMES = [
  'Alice',
  'Benjamin',
  'Carmen',
  'Dmitri',
  'Eleanor',
  'Francisco',
  'Grace',
  'Hiroshi',
  'Isabel',
  'Jamal',
  'Katherine',
  'Luis',
  'Margaret',
  'Nathaniel',
  'Olivia',
  'Patrick',
  'Quentin',
  'Rosalind',
  'Samuel',
  'Theresa',
  'Ulysses',
  'Valentina',
  'Wesley',
  'Ximena',
  'Yolanda',
  'Zachary',
  'Anastasia',
  'Bartholomew',
  'Cornelius',
  'Delphine',
  'Evangeline',
  'Fitzgerald',
];

const LAST_NAMES = [
  'Abernathy',
  'Bjornstad',
  'Castellanos',
  'Delacroix',
  'Eriksen',
  'Fairbanks',
  'Gonzalez',
  'Hutchinson',
  'Ivanova',
  'Jefferson',
  'Kowalczyk',
  'Lindqvist',
  'McAllister',
  'Nakamura',
  "O'Sullivan",
  'Pemberton',
  'Quintero',
  'Rasmussen',
  'Szymanski',
  'Thibodeaux',
  'Underwood',
  'Vandermeer',
  'Washington',
  'Yamamoto',
  'Zielinski',
  'Applegate',
  'Blankenship',
  'Christophersen',
  'Duchamp',
  'Esterhazy',
  'Fontaine',
  'Gallagher',
  'Hollingsworth',
];

const WORDS = [
  'shall',
  'the',
  'county',
  'authorize',
  'levy',
  'property',
  'tax',
  'for',
  'purpose',
  'of',
  'funding',
  'public',
  'safety',
  'services',
  'including',
  'emergency',
  'medical',
  'response',
  'and',
  'maintenance',
  'roads',
  'bridges',
  'facilities',
  'not',
  'to',
  'exceed',
  'mills',
  'period',
  'years',
  'beginning',
  'with',
  'fiscal',
  'year',
  'revenue',
  'be',
  'used',
  'solely',
  'improvements',
  'library',
  'parks',
  'water',
  'district',
  'bonds',
  'amount',
  'dollars',
];

const GENERAL_PARTIES: readonly Party[] = [
  { id: 'dem', name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
  { id: 'rep', name: 'Republican', fullName: 'Republican Party', abbrev: 'R' },
  {
    id: 'lib',
    name: 'Libertarian',
    fullName: 'Libertarian Party',
    abbrev: 'L',
  },
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function seedFromName(name: string): number {
  let hash = 2166136261;
  for (const char of name) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function districtId(layer: DistrictLayer, index: number): DistrictId {
  return `d-${slugify(layer.name)}-${index + 1}`;
}

function districtName(layer: DistrictLayer, index: number): string {
  return layer.districtCount === 1
    ? layer.name
    : `${layer.name} District ${index + 1}`;
}

function assignDistrictSets(
  spec: ElectionSpec,
  numSets: number,
  random: () => number
): Array<DistrictId[]> {
  const seen = new Set<string>();
  const sets: Array<DistrictId[]> = [];
  for (let i = 0; i < numSets; i += 1) {
    let set: DistrictId[] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      set = [];
      for (const layer of spec.layers) {
        if (random() >= (layer.coverage ?? 1)) continue;
        set.push(districtId(layer, Math.floor(random() * layer.districtCount)));
      }
      if (!seen.has(set.join(','))) break;
    }
    seen.add(set.join(','));
    sets.push(set);
  }
  return sets;
}

/** Generates a synthetic election whose shape is given by `spec`. */
export function generateElection(spec: ElectionSpec): GeneratedElection {
  const random = createRandom(seedFromName(spec.name));
  let nameIndex = 0;
  function nextCandidateName(): { firstName: string; lastName: string } {
    const firstName = FIRST_NAMES[nameIndex % FIRST_NAMES.length] ?? '';
    const lastName =
      LAST_NAMES[
        Math.floor(nameIndex / FIRST_NAMES.length) % LAST_NAMES.length
      ] ?? '';
    nameIndex += 1;
    return { firstName, lastName };
  }
  function description(words: number): string {
    const text = Array.from(
      { length: words },
      () => WORDS[Math.floor(random() * WORDS.length)]
    ).join(' ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}?`;
  }

  const parties: readonly Party[] =
    spec.type === 'primary' ? GENERAL_PARTIES.slice(0, 2) : GENERAL_PARTIES;

  const districts: District[] = spec.layers.flatMap((layer) =>
    Array.from({ length: layer.districtCount }, (_, i) => ({
      id: districtId(layer, i),
      name: districtName(layer, i),
    }))
  );

  const contests: Contest[] = [];
  for (const layer of spec.layers) {
    for (let d = 0; d < layer.districtCount; d += 1) {
      for (const contestSpec of layer.contests) {
        if (
          contestSpec.firstDistricts !== undefined &&
          d >= contestSpec.firstDistricts
        ) {
          continue;
        }
        const id = `c-${slugify(layer.name)}-${d + 1}-${slugify(contestSpec.title)}`;
        const title =
          layer.districtCount === 1
            ? contestSpec.title
            : `${contestSpec.title}, ${districtName(layer, d)}`;
        if (contestSpec.kind === 'yesno') {
          contests.push({
            id,
            type: 'yesno',
            districtId: districtId(layer, d),
            title,
            description: description(contestSpec.descriptionWords ?? 60),
            options: [
              { id: `${id}-yes`, label: 'Yes' },
              { id: `${id}-no`, label: 'No' },
            ],
          });
          continue;
        }
        const seats = contestSpec.seats ?? 1;
        const numCandidates = contestSpec.candidates ?? 2;
        const contestParties: Array<Party | undefined> =
          spec.type === 'primary' && contestSpec.partisan
            ? [...parties]
            : [undefined];
        for (const party of contestParties) {
          const contestId = party ? `${id}-${party.id}` : id;
          const candidates: Candidate[] = Array.from(
            { length: numCandidates },
            (_, i) => {
              const candidateParty =
                party ??
                (contestSpec.partisan
                  ? parties[i % parties.length]
                  : undefined);
              const candidateName = nextCandidateName();
              return {
                id: `${contestId}-cand-${i + 1}`,
                ...candidateName,
                name: `${candidateName.firstName} ${candidateName.lastName}`,
                ...(candidateParty ? { partyIds: [candidateParty.id] } : {}),
              };
            }
          );
          contests.push({
            id: contestId,
            type: 'candidate',
            districtId: districtId(layer, d),
            title,
            seats,
            allowWriteIns: true,
            candidates,
            ...(party ? { partyId: party.id } : {}),
          });
        }
      }
    }
  }

  const splitsPerPrecinct = spec.splitsPerPrecinct ?? 0;
  const numSets =
    splitsPerPrecinct > 1
      ? spec.precincts * splitsPerPrecinct
      : Math.min(spec.districtSets, spec.precincts);
  const districtSets = assignDistrictSets(spec, numSets, random);

  const precincts: Precinct[] = Array.from(
    { length: spec.precincts },
    (_, p) => {
      const id = `p-${p + 1}`;
      const name = `Precinct ${p + 1}`;
      if (splitsPerPrecinct > 1) {
        return {
          id,
          name,
          splits: Array.from({ length: splitsPerPrecinct }, (__, s) => ({
            id: `${id}-split-${s + 1}`,
            name: `${name} Split ${s + 1}`,
            districtIds: districtSets[p * splitsPerPrecinct + s] ?? [],
          })),
        };
      }
      return { id, name, districtIds: districtSets[p % numSets] ?? [] };
    }
  );

  const precinctsPerPlace = Math.ceil(spec.precincts / spec.pollingPlaces);
  const pollingPlaces: PollingPlace[] = [
    ...Array.from({ length: spec.pollingPlaces }, (_, i) => ({
      id: `pp-${i + 1}`,
      name: `Polling Place ${i + 1}`,
      type: 'election_day' as const,
      precincts: Object.fromEntries(
        precincts
          .slice(i * precinctsPerPlace, (i + 1) * precinctsPerPlace)
          .map((precinct) => [precinct.id, { type: 'whole' as const }])
      ),
    })),
    {
      id: 'pp-absentee',
      name: 'Central Count',
      type: 'absentee' as const,
      precincts: Object.fromEntries(
        precincts.map((precinct) => [precinct.id, { type: 'whole' as const }])
      ),
    },
  ].filter((place) => Object.keys(place.precincts).length > 0);

  const electionId = `perf-${spec.name}`;
  const ballotLanguageConfigs: BallotLanguageConfigs = spec.languageConfigs.map(
    (languages) => ({ languages: [...languages] })
  );
  const { ballotStyles, candidateOrderings } = generateBallotStyles({
    contests,
    ballotLanguageConfigs,
    electionType: spec.type,
    isMiCombinedBallotPrimary: false,
    parties,
    precincts,
    ballotTemplateId: 'VxDefaultBallot',
    electionId,
  });
  assert(ballotStyles.length > 0, 'No ballot styles were generated');

  const election: Election = {
    id: electionId,
    type: spec.type,
    title: spec.title,
    date: new DateWithoutTime('2026-11-03'),
    state: 'State of Hamilton',
    jurisdiction: { id: 'perf-jurisdiction', name: 'Perf County' },
    seal: electionGeneralFixtures.readElection().seal,
    districts,
    precincts,
    pollingPlaces,
    parties: [...parties],
    contests,
    ballotStyles,
    ballotLayout: { paperSize: 'letter', metadataEncoding: 'qr-code' },
    ballotStrings: {},
  };

  const contestCounts = ballotStyles.map(
    (style) =>
      contests.filter(
        (contest) =>
          style.districts.includes(contest.districtId) &&
          (contest.type !== 'candidate' ||
            !contest.partyId ||
            contest.partyId === style.partyId)
      ).length
  );

  return {
    spec,
    election,
    candidateOrderings,
    ballotLanguageConfigs,
    stats: {
      precincts: precincts.length,
      splits: splitsPerPrecinct > 1 ? spec.precincts * splitsPerPrecinct : 0,
      districts: districts.length,
      contests: contests.length,
      candidates: contests.reduce(
        (sum, contest) =>
          sum + (contest.type === 'candidate' ? contest.candidates.length : 0),
        0
      ),
      parties: parties.length,
      pollingPlaces: pollingPlaces.length,
      ballotStyles: ballotStyles.length,
      languageConfigs: ballotLanguageConfigs.length,
      contestsPerBallotStyle: {
        min: Math.min(...contestCounts),
        max: Math.max(...contestCounts),
        avg:
          Math.round(
            (contestCounts.reduce((a, b) => a + b, 0) / contestCounts.length) *
              10
          ) / 10,
      },
      pdfsPerBallotMode: ballotStyles.reduce(
        (sum, style) => sum + style.precincts.length * 2,
        0
      ),
    },
  };
}
