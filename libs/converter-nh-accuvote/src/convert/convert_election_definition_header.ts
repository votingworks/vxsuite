import { DateWithoutTime, assert, err, iter, ok } from '@votingworks/basics';
import {
  BallotPaperSize,
  Candidate,
  CandidateContest,
  DistrictIdSchema,
  Election,
  ElectionIdSchema,
  GridPositionOption,
  GridPositionWriteIn,
  Party,
  PartyIdSchema,
  YesNoContest,
  safeParse,
  safeParseElection,
  safeParseNumber,
  unsafeParse,
} from '@votingworks/types';
import { DateTime } from 'luxon';
import { sha256 } from 'js-sha256';
import { ConvertIssueKind, ConvertResult } from './types';
import { readGridFromBallotConfig } from './read_grid_from_election_definition';
import { NH_SEAL } from './seal';
import * as accuvote from './accuvote_parser';

function makeId(text: string): string {
  const hash = sha256(text);
  return `${text.replace(/[^-_a-z\d+]+/gi, '-').slice(0, 64)}-${hash.slice(
    0,
    8
  )}`;
}

/**
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  config: accuvote.BallotCardConfiguration
): ConvertResult {
  const title = config.header.electionName;
  const { electionDate, townName, townId } = config.header;

  const electionIdResult = safeParse(
    ElectionIdSchema,
    config.header.electionId
  );
  if (electionIdResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidElectionId,
          message: `Invalid election ID "${config.header.electionId}": ${
            electionIdResult.err().message
          }`,
          invalidElectionId: config.header.electionId,
        },
      ],
    });
  }
  const electionId = electionIdResult.ok();

  const parsedDate = DateTime.fromFormat(
    electionDate.trim(),
    'M/d/yyyy HH:mm:ss',
    {
      locale: 'en-US',
      zone: 'America/New_York',
    }
  );
  if (parsedDate.invalidReason) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidElectionDate,
          message: 'invalid date',
          invalidDate: electionDate,
          invalidReason: parsedDate.invalidReason,
        },
      ],
    });
  }

  const rawPrecinctId = config.header.precinctId;
  const cleanedPrecinctId = rawPrecinctId?.replace(/[^-_\w]/g, '') ?? 'default';
  const precinctId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;

  const rawDistrictId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;
  const districtIdResult = safeParse(DistrictIdSchema, rawDistrictId);
  if (districtIdResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidDistrictId,
          message: `Invalid district ID "${rawDistrictId}": ${
            districtIdResult.err().message
          }`,
          invalidDistrictId: rawDistrictId,
        },
      ],
    });
  }
  const districtId = districtIdResult.ok();

  const { ballotSize } = config.header;
  let paperSize: BallotPaperSize;
  switch (ballotSize) {
    case '8.5X11':
      paperSize = BallotPaperSize.Letter;
      break;

    case '8.5X14':
      paperSize = BallotPaperSize.Legal;
      break;

    default:
      return err({
        issues: [
          {
            kind: ConvertIssueKind.InvalidBallotSize,
            message: `invalid ballot size: ${ballotSize}`,
            invalidBallotSize: ballotSize,
          },
        ],
      });
  }

  const electionPartyName = config.header.partyName;

  const parties = new Map<string, Party>();
  const contests: Array<CandidateContest | YesNoContest> = [];
  const optionMetadataByCandidateInfo = new Map<
    accuvote.Candidate,
    | Omit<GridPositionOption, 'row' | 'column' | 'sheetNumber' | 'side'>
    | Omit<
        GridPositionWriteIn,
        'row' | 'column' | 'sheetNumber' | 'side' | 'writeInArea'
      >
  >();

  for (const contestInfo of config.candidateContests) {
    const officeName = contestInfo.office.name;
    const contestId = makeId(
      `${officeName}${electionPartyName ? `-${electionPartyName}` : ''}`
    );

    const { winnerNote } = contestInfo.office;
    const seats =
      safeParseNumber(
        winnerNote?.match(/Vote for not more than (\d+)/)?.[1]
      ).ok() ?? 1;

    const [writeInInfos, candidateInfos] = iter(
      contestInfo.candidates
    ).partition((candidate) => candidate.isWriteIn);

    const candidates: Candidate[] = [];
    for (const candidateInfo of candidateInfos) {
      const candidateName = candidateInfo.name;

      let party: Party | undefined;
      const { partyName } = candidateInfo;
      if (partyName) {
        party = parties.get(partyName);
        if (!party) {
          const partyId = makeId(partyName);
          party = {
            id: unsafeParse(PartyIdSchema, partyId),
            name: partyName,
            fullName: partyName,
            abbrev: partyName,
          };
          parties.set(partyName, party);
        }
      }

      const candidateId = makeId(candidateName);
      const existingCandidateIndex = candidates.findIndex(
        (candidate) => candidate.id === candidateId
      );

      if (existingCandidateIndex >= 0) {
        const existingPartyIds = candidates[existingCandidateIndex]?.partyIds;
        if (!party || !existingPartyIds) {
          return err({
            issues: [
              {
                kind: ConvertIssueKind.MissingDefinitionProperty,
                message: `Party is missing in candidate "${candidateName}" of office "${officeName}", required for multi-party endorsement`,
                property: 'AVSInterface > Candidates > CandidateName > Party',
              },
            ],
          });
        }

        candidates[existingCandidateIndex] = {
          id: candidateId,
          name: candidateName,
          partyIds: [...existingPartyIds, party.id],
        };
      } else {
        const candidate: Candidate = {
          id: candidateId,
          name: candidateName,
          ...(party ? { partyIds: [party.id] } : {}),
        };
        candidates.push(candidate);
      }

      optionMetadataByCandidateInfo.set(candidateInfo, {
        type: 'option',
        contestId,
        optionId: candidateId,
      });
    }

    // From the XML we've seen, write-ins are listed in reverse of the order
    // they appear on the ballot. Let's make sure.
    assert(
      iter(writeInInfos)
        .windows(2)
        .every(([earlier, later]) => earlier.ovalY > later.ovalY),
      `Write-in OY coordinates are not in reverse ballot order: ${writeInInfos
        .map(({ ovalY }) => ovalY)
        .join(', ')}`
    );
    // In order to make sure the write-in options we create have grid layout
    // coordinates in ballot order, we reverse the write-ins here.
    writeInInfos.reverse();
    for (const [i, writeInInfo] of writeInInfos.entries()) {
      optionMetadataByCandidateInfo.set(writeInInfo, {
        type: 'write-in',
        contestId,
        writeInIndex: i,
      });
    }

    contests.push({
      type: 'candidate',
      id: contestId,
      title: officeName,
      districtId,
      seats,
      allowWriteIns: writeInInfos.length > 0,
      candidates,
      // TODO: party ID?
    });
  }

  const { questions } = config;

  for (const [i, question] of questions.entries()) {
    const contestTitle = `Constitutional Amendment Question #${i + 1}`;
    const contestId = makeId(question.title);
    contests.push({
      type: 'yesno',
      id: contestId,
      title: contestTitle,
      description: question.title,
      districtId,
      yesOption: {
        id: `${contestId}-option-yes`,
        label: 'Yes',
      },
      noOption: {
        id: `${contestId}-option-no`,
        label: 'No',
      },
    });
  }

  const definitionGrid = readGridFromBallotConfig(config);

  const election: Election = {
    id: electionId,
    type: 'general',
    title,
    date: new DateWithoutTime(parsedDate.toISODate()),
    county: {
      id: townId,
      name: townName,
    },
    state: 'NH',
    parties: Array.from(parties.values()),
    precincts: [
      {
        id: precinctId,
        name: townName,
      },
    ],
    districts: [
      {
        id: districtId,
        name: townName,
      },
    ],
    ballotStyles: [
      {
        id: 'default',
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
    contests,
    ballotLayout: {
      paperSize,
      metadataEncoding: 'timing-marks',
    },
    gridLayouts: [
      {
        ballotStyleId: 'default',
        // hardcoded for NH state elections
        optionBoundsFromTargetMark: {
          left: 5,
          top: 1,
          right: 1,
          bottom: 1,
        },
        gridPositions: definitionGrid.map(({ info, column, row }) => {
          const metadata = optionMetadataByCandidateInfo.get(info);
          assert(metadata, `metadata missing for column=${column} row=${row}`);
          return metadata.type === 'option'
            ? {
                type: 'option',
                sheetNumber: 1,
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                optionId: metadata.optionId,
              }
            : {
                type: 'write-in',
                sheetNumber: 1,
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                writeInIndex: metadata.writeInIndex,
                // We'll compute the actual write-in area later once we have the
                // bubble position
                writeInArea: {
                  x: -1,
                  y: -1,
                  width: -1,
                  height: -1,
                },
              };
        }),
      },
    ],
    seal: NH_SEAL,
    // Actual translated strings will be created by VxDesign
    ballotStrings: {},
  };

  const parseElectionResult = safeParseElection(election);

  if (parseElectionResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.ElectionValidationFailed,
          message: parseElectionResult.err().message,
          validationError: parseElectionResult.err(),
        },
      ],
    });
  }

  return ok({
    election: parseElectionResult.ok(),
    issues: [],
  });
}
