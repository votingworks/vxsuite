import {
  CandidateContest,
  District,
  Election,
  ElectionId,
  ElectionType,
  hasSplits,
  HmpbBallotPaperSize,
  Party,
  Precinct,
  safeParseInt,
  YesNoContest,
  LaPresidentialCandidateBallotStrings,
  CandidateId,
  PrecinctWithoutSplits,
} from '@votingworks/types';
import { Options as CsvParseOptions, parse } from 'csv-parse/sync';
import { readdirSync, readFileSync } from 'node:fs';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  duplicates,
  find,
  unique,
} from '@votingworks/basics';
import { join } from 'node:path';
import { generateId } from '../src/utils';

export function createElectionSkeleton(
  id: ElectionId,
  type: ElectionType
): Election {
  return {
    id,
    type,
    title: 'LA Demo Election',
    date: DateWithoutTime.today(),
    state: 'LA',
    county: {
      id: generateId(),
      name: 'Demo County',
    },
    seal: '',
    districts: [],
    precincts: [],
    contests: [],
    parties: [],
    ballotStyles: [],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
}

function trimLeadingZeros(str: string): string {
  const trimmed = str.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

function getContestTitle(row: {
  contestTitle1: string;
  contestTitle2: string;
}): string {
  if (row.contestTitle1 === row.contestTitle2) {
    return row.contestTitle1;
  }
  return `${row.contestTitle1} ${row.contestTitle2}`;
}

function getDistrictName(
  row: {
    contestTitle1: string;
    contestTitle2: string;
  },
  isCandidateContest: boolean
): string {
  if (isCandidateContest) {
    return row.contestTitle2.replace(/, Office "\w"$/, '');
  }
  if (row.contestTitle1.match(/^CA No. \d+/)) {
    return 'Constitutional Amendment';
  }
  return row.contestTitle1.replace(/ Proposition No. \d+ of \d+$/, '');
}

const OFFICE_FILE_COLUMNS = [
  'officeName',
  'votesAllowed',
  'unknown',
  'isSpecialElection',
  'blank',
  'contestTitle1',
  'contestTitle2',
  'officeId',
] as const;
type OfficeFileRow = Record<(typeof OFFICE_FILE_COLUMNS)[number], string>;

const REFERENDUM_FILE_COLUMNS = [
  'electionDate',
  'officeId',
  'contestTitle1',
  'contestTitle2',
  'parishes',
  'ballotTitle',
  'ballotText',
] as const;
type ReferendumFileRow = Record<
  (typeof REFERENDUM_FILE_COLUMNS)[number],
  string
>;

const CANDIDATE_FILE_COLUMNS = [
  'lastName',
  'firstName',
  'candidateNumber',
  'party',
  'race',
  'ballotOrderNumber',
  'contestTitle1',
  'contestTitle2',
  'candidateNumberWithLeadingZeros',
] as const;
type CandidateFileRow = Record<(typeof CANDIDATE_FILE_COLUMNS)[number], string>;

const PRECINCT_FILE_COLUMNS = [
  'wardNumber',
  'precinctNumber',
  'subgroup',
  'wardAndPrecinctNumber',
  'ballotStyleNumber',
  'contestTitle1',
  'contestTitle2',
  'parishWardAndPrecinctNumber',
] as const;
type PrecinctFileRow = Record<(typeof PRECINCT_FILE_COLUMNS)[number], string>;

const PRESIDENTIAL_CANDIDATE_FILE_COLUMNS = [
  'party',
  'presidentialCandidateName',
  'presidentialCandidateState',
  'vicePresidentialCandidateName',
  'vicePresidentialCandidateState',
  'elector1',
  'elector2',
  'elector3',
  'elector4',
  'elector5',
  'elector6',
  'elector7',
  'elector8',
  'blank',
] as const;
type PresidentialCandidateFileRow = Record<
  (typeof PRESIDENTIAL_CANDIDATE_FILE_COLUMNS)[number],
  string
>;

function convertToElection(
  electionType: ElectionType,
  officeFileContents: string,
  referendumFileContents: string,
  candidateFileContents: string,
  precinctFileContents: string,
  presidentialCandidateFileContents?: string
): Election {
  const defaultParseOptions: CsvParseOptions = {
    skipEmptyLines: true,
    ignore_last_delimiters: true,
    relaxQuotes: true,
    quote: false,
    trim: true,
  };

  const officeFileRows: OfficeFileRow[] = parse(officeFileContents, {
    ...defaultParseOptions,
    columns: [...OFFICE_FILE_COLUMNS],
    delimiter: ';',
  });

  const votesAllowedByContestTitle = new Map<string, number>();
  for (const row of officeFileRows) {
    const contestTitle = getContestTitle(row);
    const votesAllowed = safeParseInt(row.votesAllowed).unsafeUnwrap();
    votesAllowedByContestTitle.set(contestTitle, votesAllowed);
  }

  // Fix newline inside of unquoted field
  // eslint-disable-next-line no-param-reassign
  referendumFileContents = referendumFileContents.replaceAll(
    'Proposition\n(Tax Continuation)|',
    'Proposition (Tax Continuation)|'
  );
  const referendumRows: ReferendumFileRow[] = parse(referendumFileContents, {
    ...defaultParseOptions,
    columns: [...REFERENDUM_FILE_COLUMNS],
    delimiter: '|',
  });

  const ballotMeasureDescriptionByContestTitle = new Map<string, string>();
  for (const row of referendumRows) {
    const contestTitle = getContestTitle(row);
    ballotMeasureDescriptionByContestTitle.set(contestTitle, row.ballotText);
  }

  const candidateFileRows: CandidateFileRow[] = parse(candidateFileContents, {
    ...defaultParseOptions,
    columns: [...CANDIDATE_FILE_COLUMNS],
    delimiter: ';',
  });

  const candidateContestsByName = new Map<string, CandidateContest>();
  const ballotMeasureContestsByName = new Map<string, YesNoContest>();
  const districtsByName = new Map<string, District>();
  const partiesByName = new Map<string, Party>();

  for (const row of candidateFileRows) {
    let party: Party | undefined;
    if (row.party) {
      party = partiesByName.get(row.party) ?? {
        id: generateId(),
        name: row.party,
        fullName: row.party,
        abbrev: row.party.charAt(0),
      };
      partiesByName.set(row.party, party);
    }

    const contestTitle = getContestTitle(row);
    const ballotMeasureDescription =
      ballotMeasureDescriptionByContestTitle.get(contestTitle);
    const isCandidateContest = !ballotMeasureDescription;

    // Create a district for each contest
    const districtName = getDistrictName(row, isCandidateContest);
    const district = districtsByName.get(districtName) ?? {
      id: generateId(),
      name: districtName,
    };
    districtsByName.set(districtName, district);

    if (isCandidateContest) {
      const contest = candidateContestsByName.get(contestTitle) ?? {
        id: generateId(),
        title: contestTitle,
        type: 'candidate',
        candidates: [],
        districtId: district.id,
        seats: assertDefined(
          votesAllowedByContestTitle.get(contestTitle),
          `Votes allowed not found for contest: ${contestTitle}`
        ),
        allowWriteIns: false,
        partyId: electionType === 'primary' ? party?.id : undefined,
      };
      candidateContestsByName.set(contestTitle, {
        ...contest,
        candidates: [
          ...contest.candidates,
          {
            id: generateId(),
            lastName: row.lastName,
            middleName: '',
            firstName: row.firstName,
            name: `${row.firstName} ${row.lastName}`,
            partyIds:
              electionType === 'general' && party ? [party.id] : undefined,
          },
        ],
      });
    } else {
      let contest = ballotMeasureContestsByName.get(contestTitle);
      if (!contest) {
        contest = {
          id: generateId(),
          type: 'yesno',
          title: contestTitle,
          description: ballotMeasureDescription,
          districtId: district.id,
          yesOption: {
            id: generateId(),
            label: row.lastName,
          },
          // Fill in from next row
          noOption: {
            id: '',
            label: '',
          },
        };
      } else {
        contest = {
          ...contest,
          noOption: {
            id: generateId(),
            label: row.lastName,
          },
        };
      }
      ballotMeasureContestsByName.set(contestTitle, contest);
    }
  }

  const precinctFileRows: PrecinctFileRow[] = parse(precinctFileContents, {
    ...defaultParseOptions,
    columns: [...PRECINCT_FILE_COLUMNS],
    delimiter: ';',
  });

  const precinctDistrictGroups = new Map<string, Map<string, District[]>>();

  // Each row represents the assignment of a single contest to a precinct ballot
  // style (which could be for a split or a party-specific ballot style).
  for (const row of precinctFileRows) {
    const precinctName = `Ward ${trimLeadingZeros(
      row.wardNumber
    )}, Precinct ${trimLeadingZeros(row.precinctNumber)}`;

    const contestTitle = getContestTitle(row);
    const isCandidateContest = candidateContestsByName.has(contestTitle);
    const district = districtsByName.get(
      getDistrictName(row, isCandidateContest)
    );
    assert(
      district,
      `District not found for contest in precinct file: ${contestTitle}`
    );

    const precinctGroups =
      precinctDistrictGroups.get(precinctName) ?? new Map<string, District[]>();
    const precinctGroup = precinctGroups.get(row.subgroup) ?? [];
    precinctGroups.set(row.subgroup, unique([...precinctGroup, district]));
    precinctDistrictGroups.set(precinctName, precinctGroups);
  }

  // Precincts appear to have subgroups for two reasons:
  // - Different party ballots (in a primary election only)
  // - Split precincts
  // It's possible to have both occur in the same precinct.
  // To create precincts and splits, we need to filter out cases where there's
  // no precinct split and only the party is different, since those can share a
  // precinct. Merge all of district groups within a precinct when it's a
  // primary election and their contests are all for different parties.
  if (electionType === 'primary') {
    for (const [precinctName, districtGroups] of precinctDistrictGroups) {
      if (districtGroups.size === 1) continue;
      const groupParties = Object.fromEntries(
        [...districtGroups.entries()].map(([groupLabel, groupDistricts]) => {
          const subgroupContests = groupDistricts.flatMap((district) =>
            [...candidateContestsByName.values()].filter(
              (contest) => contest.districtId === district.id
            )
          );
          const uniqueParties = unique(
            subgroupContests.map((contest) => contest.partyId).filter(Boolean)
          );
          assert(uniqueParties.length === 1);
          return [groupLabel, assertDefined(uniqueParties[0])];
        })
      );

      if (duplicates(Object.values(groupParties)).length === 0) {
        const mergedDistricts = unique([...districtGroups.values()].flat());
        precinctDistrictGroups.set(
          precinctName,
          new Map([['Merged', mergedDistricts]])
        );
      }
    }
  }

  const precincts: Precinct[] = [...precinctDistrictGroups.entries()].map(
    ([precinctName, districtGroups]) => {
      if (districtGroups.size === 1) {
        const [precinctDistricts] = [...districtGroups.values()];
        return {
          id: generateId(),
          name: precinctName,
          districtIds: precinctDistricts.map((district) => district.id),
        };
      }
      return {
        id: generateId(),
        name: precinctName,
        splits: [...districtGroups.entries()].map(
          ([subgroupLabel, precinctDistricts]) => ({
            id: generateId(),
            name: `${precinctName} - Split ${subgroupLabel}`,
            districtIds: precinctDistricts.map((district) => district.id),
          })
        ),
      };
    }
  );

  const districts = [...districtsByName.values()].filter((district) =>
    precincts.some((precinct) =>
      hasSplits(precinct)
        ? precinct.splits.some((split) =>
            split.districtIds.includes(district.id)
          )
        : precinct.districtIds.includes(district.id)
    )
  );
  const contests = [
    ...candidateContestsByName.values(),
    ...ballotMeasureContestsByName.values(),
  ];

  // Attempt to merge the contest-specific districts into more meaningful legal/geographical districts
  // 1. First, group contest districts that are always assigned to the same precincts/splits. If two contests are always on the ballot together, they might be from the same district.
  // 2. Examine district names within a group to see if they can be merged into a single district.
  // const candidateDistrictsToMerge: Array<District[]> = groupBy(
  //   districts,
  //   (district) =>
  //     precincts.flatMap((precinct) =>
  //       hasSplits(precinct)
  //         ? precinct.splits
  //             .filter((split) => split.districtIds.includes(district.id))
  //             .map((split) => split.id)
  //         : precinct.districtIds.includes(district.id)
  //         ? [precinct.id]
  //         : []
  //     )
  // );
  // console.warn(
  //   candidateDistrictsToMerge.map(([_, districts]) =>
  //     districts.map((d) => d.name)
  //   )
  // );

  // const precinctSplitNames = precincts.flatMap((precinct) =>
  //   hasSplits(precinct) ? precinct.splits.map((split) => split.name) : []
  // );
  // console.warn(duplicates(precinctSplitNames));

  // const districtsToPrecinctOrSplitIds: Map<DistrictId, string[]> = new Map();
  // for (const precinct of electionPrecincts) {
  //   if (hasSplits(precinct)) {
  //     for (const split of precinct.splits) {
  //       for (const districtId of split.districtIds) {
  //         districtsToPrecinctOrSplitIds.set(districtId, [
  //           ...(districtsToPrecinctOrSplitIds.get(districtId) ?? []),
  //           split.id,
  //         ]);
  //       }
  //     }
  //   } else {
  //     for (const districtId of precinct.districtIds) {
  //       districtsToPrecinctOrSplitIds.set(districtId, [
  //         ...(districtsToPrecinctOrSplitIds.get(districtId) ?? []),
  //         precinct.id,
  //       ]);
  //     }
  //   }
  // }

  const presidentialCandidateBallotStrings:
    | Record<CandidateId, LaPresidentialCandidateBallotStrings>
    | undefined = presidentialCandidateFileContents
    ? (() => {
        const presidentialCandidateFileRows: PresidentialCandidateFileRow[] =
          parse(presidentialCandidateFileContents, {
            ...defaultParseOptions,
            columns: [...PRESIDENTIAL_CANDIDATE_FILE_COLUMNS],
            delimiter: ';',
          });

        const presidentialContest = find(
          contests,
          (contest): contest is CandidateContest =>
            contest.type === 'candidate' &&
            contest.title === 'Presidential Electors'
        );
        return Object.fromEntries(
          presidentialCandidateFileRows
            // Skip last row with additional contest copy
            .filter((row) => Boolean(row.party))
            .map((row) => {
              const candidateId = find(
                presidentialContest.candidates,
                (candidate) => candidate.lastName === row.party
              ).id;
              return [
                candidateId,
                {
                  ...row,
                  electors: [
                    row.elector1,
                    row.elector2,
                    row.elector3,
                    row.elector4,
                    row.elector5,
                    row.elector6,
                    row.elector7,
                    row.elector8,
                  ],
                },
              ];
            })
        );
      })()
    : undefined;

  const precinct = find(
    precincts,
    (p) => !hasSplits(p)
  ) as PrecinctWithoutSplits;
  return {
    ...createElectionSkeleton(generateId(), electionType),
    precincts,
    districts,
    parties: [...partiesByName.values()],
    contests,
    // At least one ballot style is required, so we create a dummy
    ballotStyles: [
      {
        id: generateId(),
        groupId: generateId(),
        districts: precinct.districtIds,
        precincts: [precinct.id],
      },
    ],
    customBallotContent: { presidentialCandidateBallotStrings },
  };
}

const USAGE = `Usage: convert_la_election general|primary election-data-directory`;
function main(args: readonly string[]): void {
  if (args.length !== 2) {
    console.error(USAGE);
    process.exit(1);
  }

  const [electionType, electionDataDirectory] = args;
  assert(
    electionType === 'general' || electionType === 'primary',
    `Invalid election type: ${electionType}. Must be 'general' or 'primary'.`
  );
  const electionFileNames = readdirSync(electionDataDirectory).filter(
    (fileName) => fileName.endsWith('.txt')
  );

  const officeFileName = find(electionFileNames, (fileName) =>
    fileName.includes('MO-OR')
  );
  const officeFileContents = readFileSync(
    join(electionDataDirectory, officeFileName),
    'utf-8'
  );

  const referendumFileName = find(electionFileNames, (fileName) =>
    fileName.includes('SEQREF')
  );
  const referendumFileContents = readFileSync(
    join(electionDataDirectory, referendumFileName),
    'utf-8'
  );

  const candidateFileName = find(electionFileNames, (fileName) =>
    fileName.includes('CAND')
  );
  const candidateFileContents = readFileSync(
    join(electionDataDirectory, candidateFileName),
    'utf-8'
  );

  const precinctFileName = find(electionFileNames, (fileName) =>
    fileName.includes('PCT-DR')
  );
  const precinctFileContents = readFileSync(
    join(electionDataDirectory, precinctFileName),
    'utf-8'
  );

  const presidentialCandidateFileName = electionFileNames.find((fileName) =>
    fileName.includes('Presidential_General')
  );
  const presidentialCandidateFileContents =
    presidentialCandidateFileName &&
    readFileSync(
      join(electionDataDirectory, presidentialCandidateFileName),
      'utf-8'
    );

  const election = convertToElection(
    electionType,
    officeFileContents,
    referendumFileContents,
    candidateFileContents,
    precinctFileContents,
    presidentialCandidateFileContents
  );
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));
