import {
  assertDefined,
  DateWithoutTime,
  mergeObjects,
  range,
} from '@votingworks/basics';
import {
  AnyContest,
  HmpbBallotPaperSize,
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  District,
  DistrictId,
  Election,
  ElectionId,
  ElectionSchema,
  Party,
  PartyId,
  Precinct,
  safeParse,
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
      id: `district-${index}` as DistrictId,
      name: randomString(maxStringLengths.districtName, words.locations),
    };
  }
  const districts = range(0, config.numDistricts).map(generateDistrict);

  function generatePrecinct(index: number): Precinct {
    return {
      id: `precinct-${index}`,
      name: randomString(maxStringLengths.precinctName, words.locations),
    };
  }
  const precincts = range(0, config.numPrecincts).map(generatePrecinct);

  function generateBallotStyle(index: number): BallotStyle {
    return {
      id: `ballot-style-${index}` as BallotStyleId,
      groupId: `ballot-style-${index}` as BallotStyleGroupId,
      districts: chooseRandomSubset(districts).map((district) => district.id),
      precincts: chooseRandomSubset(precincts).map((precinct) => precinct.id),
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
      id: `party-${index}` as PartyId,
      name,
      fullName: name,
      abbrev: name
        .substring(0, maxStringLengths.partyAbbreviation)
        .toLocaleUpperCase(),
    };
  }
  const parties = range(0, config.numParties).map(generateParty);

  function generateContest(index: number): AnyContest {
    const baseContest = {
      id: `contest-${index}`,
      districtId: chooseRandom(districts).id,
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
  const contests = range(0, config.numContests).map(generateContest);

  const election: Election = {
    title: randomString(maxStringLengths.title, words.titles),
    id: generateId() as ElectionId,
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
