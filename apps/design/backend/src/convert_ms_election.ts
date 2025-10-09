import {
  assert,
  assertDefined,
  DateWithoutTime,
  find,
  groupBy,
} from '@votingworks/basics';
import {
  AnyContest,
  Candidate,
  County,
  District,
  Election,
  ElectionId,
  HmpbBallotPaperSize,
  Party,
  Precinct,
  safeParseNumber,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { splitCandidateName } from './utils';

const counties: Record<string, string> = {
  '1': 'Adams',
  '2': 'Alcorn',
  '3': 'Amite',
  '4': 'Attala',
  '5': 'Benton',
  '6': 'Bolivar',
  '7': 'Calhoun',
  '8': 'Carroll',
  '9': 'Chickasaw',
  '10': 'Choctaw',
  '11': 'Claiborne',
  '12': 'Clarke',
  '13': 'Clay',
  '14': 'Coahoma',
  '15': 'Copiah',
  '16': 'Covington',
  '17': 'DeSoto',
  '18': 'Forrest',
  '19': 'Franklin',
  '20': 'George',
  '21': 'Greene',
  '22': 'Grenada',
  '23': 'Hancock',
  '24': 'Harrison',
  '25': 'Hinds',
  '26': 'Holmes',
  '27': 'Humphreys',
  '28': 'Issaquena',
  '29': 'Itawamba',
  '30': 'Jackson',
  '31': 'Jasper',
  '32': 'Jefferson',
  '33': 'Jeff Davis',
  '34': 'Jones',
  '35': 'Kemper',
  '36': 'Lafayette',
  '37': 'Lamar',
  '38': 'Lauderdale',
  '39': 'Lawrence',
  '40': 'Leake',
  '41': 'Lee',
  '42': 'Leflore',
  '43': 'Lincoln',
  '44': 'Lowndes',
  '45': 'Madison',
  '46': 'Marion',
  '47': 'Marshall',
  '48': 'Monroe',
  '49': 'Montgomery',
  '50': 'Neshoba',
  '51': 'Newton',
  '52': 'Noxubee',
  '53': 'Oktibbeha',
  '54': 'Panola',
  '55': 'Pearl River',
  '56': 'Perry',
  '57': 'Pike',
  '58': 'Pontotoc',
  '59': 'Prentiss',
  '60': 'Quitman',
  '61': 'Rankin',
  '62': 'Scott',
  '63': 'Sharkey',
  '64': 'Simpson',
  '65': 'Smith',
  '66': 'Stone',
  '67': 'Sunflower',
  '68': 'Tallahatchie',
  '69': 'Tate',
  '70': 'Tippah',
  '71': 'Tishomingo',
  '72': 'Tunica',
  '73': 'Union',
  '74': 'Walthall',
  '75': 'Warren',
  '76': 'Washington',
  '77': 'Wayne',
  '78': 'Webster',
  '79': 'Wilkinson',
  '80': 'Winston',
  '81': 'Yalobusha',
  '82': 'Yazoo',
};

export function convertMsElection(
  newElectionId: ElectionId,
  semsElectionFileContents: string,
  semsCandidateFileContents: string
): Election {
  const electionFileRows: Array<string[]> = parse(semsElectionFileContents, {
    trim: true,
    relaxColumnCount: true,
  });
  const candidateFileRows: Array<string[]> = parse(semsCandidateFileContents, {
    trim: true,
  }).filter((row: string[]) => row.every((cell) => cell !== ''));

  // Election file format:
  // 9 sections, each row starts with 0-8 to idenify which section it's a part of
  function sectionRows(sectionNumber: number): Array<string[]> {
    return electionFileRows.filter((row) => row[0] === String(sectionNumber));
  }

  // Section 0 is one row: 0, "GEMS Import Data", MAJOR_VERSION, MINOR_VERSION, SORT_BY, ?, ?, ?
  // Skip it

  // Section 1 is one row: 1, ELECTION_TITLE, ELECTION_DATE
  const [[, title, dateString]] = sectionRows(1);
  const [month, day, year] = dateString.split('/');
  const date = new DateWithoutTime(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  );

  // Section 2 is one row per district: 2, PARENT_DISTRICT, DISTRICT_ID, DISTRICT_LABEL
  const districts: District[] = sectionRows(2).map((row) => {
    const [, , id, label] = row;
    return { id, name: label };
  });

  // Section 3 is one row per polling location: 3, REGION_ID, LOCATION_ID, LOCATION_LABEL
  // Skip it

  // Section 4 is one row per precinct/split: 4, LOCATION_ID, PRECINCT_ID, SPLIT_ID, PRECINCT_LABEL, NUM_REG_VOTERS, BALLOT_STYLE
  // Section 5 is one row mapping which splits have which districts: 5, SPLIT_ID, DISTRICT_ID
  const splitsToDistricts = new Map(
    groupBy(sectionRows(5), ([, splitId]) => splitId).map(([splitId, rows]) => [
      splitId,
      rows.map(([, , districtId]) => districtId),
    ])
  );
  const precincts: Precinct[] = groupBy(
    sectionRows(4),
    ([, , precinctId]) => precinctId
  ).map(([precinctId, rows]) => {
    const precinctLabel = rows[0][4];
    const base = {
      id: precinctId,
      name: precinctLabel,
    } as const;
    if (rows.length === 1) {
      return {
        ...base,
        districtIds: assertDefined(splitsToDistricts.get(rows[0][3])),
      };
    }
    return {
      ...base,
      splits: rows.map((row, i) => {
        const splitId = row[3];
        return {
          id: splitId,
          name: `${precinctLabel} - Split #${i + 1}`,
          districtIds: assertDefined(splitsToDistricts.get(splitId)),
        };
      }),
    };
  });

  // Section 6 is one row per party: 6, PARTY_ID, PARTY_LABEL, PARTY_ABBREV, PARTY_ID(again), PARTY_LABEL_ON_BALLOT
  const parties: Party[] = sectionRows(6).map((row) => {
    const [, id, label, abbrev] = row;
    const fullName =
      label === 'Democrat'
        ? 'Democratic Party'
        : label === 'Nonpartisan'
        ? label
        : `${label} Party`;
    return { id, name: label, fullName, abbrev };
  });

  // Section 7 is one row per contest: 7, CONTEST_ID, CONTEST_LABEL, CONTEST_TYPE, 0, DISTRICT_ID, NUM_VOTE_FOR, NUM_WRITE_INS, CONTEST_TEXT, PARTY_ID, 0
  // - CONTEST_TYPE: 0 candidate, 1 question/measure
  // - PARTY_ID is 0 for non-partisan
  //
  // Section 8 is one row per candidate: 8, CONTEST_ID, CANDIDATE_ID, CANDIDATE_LABEL, CANDIDATE_TYPE, SORT_SEQ, PARTY_ID, CANDIDATE_LABEL_ON_BALLOT
  // - CANDIDATE_TYPE is 0 for normal, 1 for write-in (??), and 2 for registered write-in
  // - PARTY_ID is 0 for non-partisan
  //
  //  Candidate file format:
  //  Every row is
  //  9, COUNTY_CODE, CONTEST_ID, CANDIDATE_SEQ_NUM, SEMS_CANDIDATE_ID
  //  The CANDIDATE_ID in the election file is not globally unique, it's only unique within a contest.
  //  Results have to be reported by SEMS candidate ID which is in the candidate file.
  const [, countyId] = candidateFileRows[0];
  const county: County = {
    id: countyId,
    name: `${counties[countyId]} County`,
  };

  function getCandidateSemsId(
    contestId: string,
    candidateSeqNum: string
  ): string {
    const [, , , , candidateSemsId] = find(
      candidateFileRows,
      ([, , rowContestId, rowCandidateSeqNum]) =>
        rowContestId === contestId && rowCandidateSeqNum === candidateSeqNum
    );
    return candidateSemsId;
  }

  const candidatesByContest = new Map(
    groupBy(sectionRows(8), ([, contestId]) => contestId)
  );

  const contests: AnyContest[] = sectionRows(7).map((row) => {
    const [
      ,
      contestId,
      label,
      contestType,
      ,
      districtId,
      numVoteFor,
      numWriteIns,
      contestText,
      partyId,
    ] = row;
    switch (contestType) {
      // Candidate contest
      case '0': {
        const candidates = assertDefined(candidatesByContest.get(contestId))
          .map((candidateRow): [number, Candidate] => {
            const [
              ,
              ,
              candidateId,
              ,
              ,
              sortSeq,
              candidatePartyId,
              candidateLabelOnBallot,
            ] = candidateRow;
            return [
              safeParseNumber(sortSeq).unsafeUnwrap(),
              {
                id: getCandidateSemsId(contestId, candidateId),
                name: candidateLabelOnBallot,
                ...splitCandidateName(candidateLabelOnBallot),
                partyIds:
                  candidatePartyId === '' || candidatePartyId === '0'
                    ? undefined
                    : [candidatePartyId],
              },
            ];
          })
          .sort(([sortSeqA], [sortSeqB]) => sortSeqA - sortSeqB)
          .map(([, candidate]) => candidate);
        return {
          id: contestId,
          type: 'candidate',
          title: label,
          districtId,
          seats: safeParseNumber(numVoteFor).unsafeUnwrap(),
          allowWriteIns: numWriteIns !== '0',
          partyId: partyId === '' || partyId === '0' ? undefined : partyId,
          candidates,
        };
      }

      // Ballot measure
      case '1': {
        const candidateRows = assertDefined(candidatesByContest.get(contestId));
        assert(candidateRows.length === 2);
        // eslint-disable-next-line vx/no-array-sort-mutation
        const [yesCandidateRow, noCandidateRow] = candidateRows.sort(
          ([, , , , , sortSeqA], [, , , , , sortSeqB]) =>
            safeParseNumber(sortSeqA).unsafeUnwrap() -
            safeParseNumber(sortSeqB).unsafeUnwrap()
        );
        const [, , yesCandidateId, , , , yesLabel] = yesCandidateRow;
        const [, , noCandidateId, , , , noLabel] = noCandidateRow;
        return {
          id: contestId,
          type: 'yesno',
          title: label,
          districtId,
          description: contestText,
          yesOption: {
            id: getCandidateSemsId(contestId, yesCandidateId),
            label: yesLabel,
          },
          noOption: {
            id: getCandidateSemsId(contestId, noCandidateId),
            label: noLabel,
          },
        };
      }

      default:
        throw new Error(`Unknown contest type: ${contestType}`);
    }
  });

  return {
    id: newElectionId,
    type: 'general', // TODO
    title,
    date,
    state: 'State of Mississippi',
    county,
    districts,
    precincts,
    parties,
    contests,
    seal: 'TODO',
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {}, // Will be generated later
    ballotStyles: [], // Will be generated later
  };
}

// TODO IDs aren't globally unique
