import {
  assert,
  assertDefined,
  DateWithoutTime,
  mergeObjects,
  range,
  unique,
} from '@votingworks/basics';
import {
  AnyContest,
  HmpbBallotPaperSize,
  BallotStyle,
  District,
  Election,
  ElectionSchema,
  Party,
  Precinct,
  safeParse,
  PrecinctWithoutSplits,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';
import { defaultConfig, GenerateElectionConfig } from './config';
import { ballotMeasureText, seal, words } from './source_text';

const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

function chooseRandom<T>(array: T[]): T {
  return assertDefined(array[Math.floor(Math.random() * array.length)]);
}

function chooseRandomSubset<T>(array: T[]): T[] {
  const numItems = Math.floor(Math.random() * array.length);
  const result = new Set<T>();
  while (result.size < numItems) {
    result.add(chooseRandom(array));
  }
  return Array.from(result);
}

function randomString(maxLength: number, sourceWords: string[]): string {
  let result = `${maxLength}:`;
  while (result.length < maxLength) {
    result += ` ${chooseRandom(sourceWords)}`;
  }
  return result.slice(0, maxLength);
}

type PartialDeep<T> = T extends object
  ? {
      [P in keyof T]?: PartialDeep<T[P]>;
    }
  : T;

/**
 * Returns a set of strings in `b` that are not contained in `a`.
 */
function difference(a: Set<string>, b: Set<string>): Set<string> {
  const diff = new Set<string>();
  for (const value of b) {
    if (!a.has(value)) {
      diff.add(value);
    }
  }

  return diff;
}

function generatePrecinctsWithExhaustiveDistricts(
  districts: District[],
  config: GenerateElectionConfig
): Precinct[] {
  const { maxStringLengths, numPrecincts } = config;

  function generatePrecinct(
    index: number,
    _districts: District[]
  ): PrecinctWithoutSplits {
    return {
      id: `precinct-${index}`,
      name: randomString(maxStringLengths.precinctName, words.locations),
      districtIds: chooseRandomSubset(_districts).map(
        (district) => district.id
      ),
    };
  }

  function districtIdsFromPrecincts(
    _precincts: PrecinctWithoutSplits[]
  ): Set<string> {
    const districtIds = new Set<string>();
    for (const p of _precincts) {
      for (const d of p.districtIds) {
        districtIds.add(d);
      }
    }

    return districtIds;
  }

  function districtIdsFromDistricts(_districts: District[]): Set<string> {
    return new Set<string>(_districts.map((d) => d.id));
  }

  // Generate precincts randomly
  const precincts = range(0, numPrecincts).map((i) =>
    generatePrecinct(i, districts)
  );

  // Find IDs of any districts that were not assigned to a precinct in the first pass
  const unusedDistrictIds = difference(
    districtIdsFromPrecincts(precincts),
    districtIdsFromDistricts(districts)
  );

  // Assign straggler district IDs to precincts
  for (const d of unusedDistrictIds) {
    const i = Math.floor(Math.random() * numPrecincts);
    const precinct = assertDefined(precincts[i]);
    precinct.districtIds = [...precinct.districtIds, d];
  }

  return precincts;
}

/**
 * Generates an election with mock content based on the given parameters.
 */
export function generateElection(
  inputConfig: PartialDeep<GenerateElectionConfig>
): Election {
  const config = mergeObjects(
    defaultConfig as Partial<GenerateElectionConfig>,
    inputConfig
  ) as GenerateElectionConfig;
  const { maxStringLengths } = config;

  function generateDistrict(index: number): District {
    return {
      id: `district-${index}`,
      name: randomString(maxStringLengths.districtName, words.locations),
    };
  }
  const districts = range(0, config.numDistricts).map(generateDistrict);

  const precincts = generatePrecinctsWithExhaustiveDistricts(districts, config);

  function generateBallotStyle(index: number): BallotStyle {
    // const ballotStylePrecincts = chooseRandomSubset(
    //   precincts
    // ) as PrecinctWithoutSplits[];
    const ballotStylePrecincts = [
      chooseRandom(precincts),
    ] as PrecinctWithoutSplits[];

    return {
      id: `ballot-style-${index}`,
      groupId: `ballot-style-${index}`,
      precincts: ballotStylePrecincts.map((precinct) => precinct.id),
      districts: unique(
        ballotStylePrecincts.flatMap((precinct) => precinct.districtIds)
      ),
    };
  }
  const ballotStyles = range(0, config.numBallotStyles).map(
    generateBallotStyle
  );

  function generateParty(index: number): Party {
    const partyStr = ' Party';
    const name =
      randomString(
        maxStringLengths.partyFullName - partyStr.length,
        words.parties
      ) + partyStr;
    return {
      id: `party-${index}`,
      name,
      fullName: name,
      abbrev: name
        .substring(0, maxStringLengths.partyAbbreviation)
        .toLocaleUpperCase(),
    };
  }
  const parties = range(0, config.numParties).map(generateParty);

  function generateContest(index: number, districtIds: string[]): AnyContest {
    const baseContest = {
      id: `contest-${index}`,
      districtId: chooseRandom(districtIds),
      title: randomString(maxStringLengths.contestTitle, words.offices),
    } as const;
    if (Math.random() < 0.5) {
      return {
        ...baseContest,
        type: 'candidate',
        termDescription: randomString(
          maxStringLengths.contestTermDescription,
          words.durations
        ),
        seats: config.maxContestVoteFor,
        candidates: range(0, config.numCandidatesPerContest).map(
          (canididateIndex) => ({
            id: `${baseContest.id}-candidate-${canididateIndex}`,
            name: randomString(maxStringLengths.candidateName, words.people),
            partyId: chooseRandom(parties).id,
          })
        ),
        allowWriteIns: true,
      };
    }
    return {
      ...baseContest,
      type: 'yesno',
      description: randomString(maxStringLengths.contestBallotMeasureText, [
        ballotMeasureText,
      ]),
      yesOption: {
        id: `${baseContest.id}-option-yes`,
        label: randomString(
          maxStringLengths.contestBallotMeasureOptionLabel,
          words.yes
        ),
      },
      noOption: {
        id: `${baseContest.id}-option-no`,
        label: randomString(
          maxStringLengths.contestBallotMeasureOptionLabel,
          words.no
        ),
      },
    };
  }
  assert(
    config.numContests >= config.numDistricts,
    'numContests must be >= numDistricts or there will be districts without contests'
  );

  const allDistrictIds = districts.map((d) => d.id);
  const unusedDistrictIds = allDistrictIds.slice();
  const contests: AnyContest[] = [];
  for (let i = 0; i < config.numContests; i += 1) {
    const districtIdPool =
      unusedDistrictIds.length > 0 ? unusedDistrictIds : allDistrictIds;
    const newContest = generateContest(i, districtIdPool);
    contests.push(newContest);
    unusedDistrictIds.splice(
      unusedDistrictIds.findIndex((id) => id === newContest.districtId),
      1
    );
  }

  const contestsByDistrict: Record<string, string[]> = {};
  for (const c of contests) {
    const existingContests = contestsByDistrict[c.districtId] || [];
    contestsByDistrict[c.districtId] = [...existingContests, c.districtId];
  }

  const election: Election = {
    title: randomString(maxStringLengths.title, words.titles),
    id: generateId(),
    date: DateWithoutTime.today(),
    type: 'general',
    county: {
      id: generateId(),
      name: randomString(maxStringLengths.countyName, words.locations),
    },
    state: randomString(maxStringLengths.stateName, words.locations),
    seal,
    ballotLayout: {
      metadataEncoding: 'qr-code',
      paperSize: HmpbBallotPaperSize.Custom22,
    },
    ballotStrings: {},
    districts,
    precincts,
    ballotStyles,
    parties,
    contests,
  };

  return safeParse(ElectionSchema, election).unsafeUnwrap();
}
