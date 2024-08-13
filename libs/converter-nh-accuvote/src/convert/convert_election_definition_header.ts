import {
  assert,
  assertDefined,
  err,
  iter,
  ok,
  Optional,
} from '@votingworks/basics';
import {
  BallotPaperSize,
  Candidate,
  CandidateContest,
  DistrictIdSchema,
  Election,
  GridPositionOption,
  GridPositionWriteIn,
  Party,
  PartyIdSchema,
  safeParse,
  safeParseElection,
  safeParseNumber,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';
import makeDebug from 'debug';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import * as accuvote from './accuvote';
import { parseConstitutionalQuestions } from './parse_constitutional_questions';
import { readGridFromElectionDefinition } from './read_grid_from_election_definition';
import { NH_SEAL } from './seal';
import { ConvertIssue, ConvertIssueKind, ResultWithIssues } from './types';

const debug = makeDebug('converter-nh-accuvote:convert');

function makeId(text: string): string {
  const hash = sha256(text);
  return `${text.replace(/[^-_a-z\d+]+/gi, '-').slice(0, 64)}-${hash.slice(
    0,
    8
  )}`;
}

function parseDate(rawDate: string): Optional<DateTime> {
  const dateFormats = ['M/d/yyyy HH:mm:ss', 'M/dd/yyyy'];
  return dateFormats
    .map((format) =>
      DateTime.fromFormat(rawDate.trim(), format, {
        locale: 'en-US',
        zone: 'America/New_York',
      })
    )
    .find((date) => date.isValid);
}

/**
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  avsInterface: accuvote.AvsInterface
): ResultWithIssues<Election> {
  const {
    ballotSize,
    electionDate: rawDate,
    electionName: title,
    partyName: electionPartyName,
    precinctId: rawPrecinctId,
    townName,
    townId,
  } = avsInterface.accuvoteHeaderInfo;

  const parsedDate = parseDate(rawDate);
  if (!parsedDate) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidElectionDate,
          message: 'invalid date',
          invalidDate: rawDate,
        },
      ],
    });
  }

  const cleanedPrecinctId = rawPrecinctId?.replace(/[^-_\w]/g, '');
  const precinctId = cleanedPrecinctId
    ? `town-id-${townId}-precinct-id-${cleanedPrecinctId}`
    : `town-id-${townId}-precinct`;

  const rawDistrictId = `town-id-${townId}-district`;
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

  const electionParty: Party | undefined = electionPartyName
    ? {
        id: unsafeParse(PartyIdSchema, makeId(electionPartyName)),
        name: electionPartyName,
        fullName: electionPartyName,
        abbrev: electionPartyName,
      }
    : undefined;

  const parties = new Map<string, Party>();
  if (electionPartyName) {
    parties.set(electionPartyName, assertDefined(electionParty));
  }

  const contests: Array<CandidateContest | YesNoContest> = [];
  const optionMetadataByCandidate = new Map<
    accuvote.CandidateName,
    | Omit<GridPositionOption, 'row' | 'column' | 'sheetNumber' | 'side'>
    | Omit<
        GridPositionWriteIn,
        'row' | 'column' | 'sheetNumber' | 'side' | 'writeInArea'
      >
  >();

  for (const candidateContest of avsInterface.candidates) {
    const officeName = candidateContest.officeName.name;
    const contestId = makeId(
      `${officeName}${electionPartyName ? `-${electionPartyName}` : ''}`
    );

    const { winnerNote } = candidateContest.officeName;
    const seats =
      safeParseNumber(
        winnerNote?.match(/Vote for not more than (\d+)/)?.[1]
      ).ok() ??
      safeParseNumber(winnerNote?.match(/Vote for up to (\d+)/)?.[1]).ok() ??
      1;

    const [writeInCandidates, nonWriteInCandidates] = iter(
      candidateContest.candidateNames
    ).partition((candidate) => candidate.writeIn);

    const candidates: Candidate[] = [];
    for (const nonWriteInCandidate of nonWriteInCandidates) {
      const candidateName = nonWriteInCandidate.name;

      let party: Party | undefined;
      const partyName = nonWriteInCandidate.party;
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

      optionMetadataByCandidate.set(nonWriteInCandidate, {
        type: 'option',
        contestId,
        optionId: candidateId,
      });
    }

    // From the XML we've seen, write-ins are sometimes listed in reverse of the
    // order they appear on the ballot. In order to make sure the write-in
    // options we create have grid layout coordinates in ballot order, we sort
    // the write-ins here.
    const writeInCandidatesInBallotOrder = [...writeInCandidates].sort(
      (writeInA, writeInB) => writeInA.oy - writeInB.oy
    );
    for (const [
      i,
      writeInCandidate,
    ] of writeInCandidatesInBallotOrder.entries()) {
      optionMetadataByCandidate.set(writeInCandidate, {
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
      allowWriteIns: writeInCandidates.length > 0,
      candidates,
      partyId: electionParty?.id,
    });
  }

  const issues: ConvertIssue[] = [];
  const questions = avsInterface.ballotPaperInfo?.questions;

  if (questions) {
    const parseConstitutionalQuestionsResult =
      parseConstitutionalQuestions(questions);
    debug('questions decoded: %o', parseConstitutionalQuestionsResult);

    if (parseConstitutionalQuestionsResult.isErr()) {
      issues.push({
        kind: ConvertIssueKind.ConstitutionalQuestionError,
        message: parseConstitutionalQuestionsResult.err().message,
        error: parseConstitutionalQuestionsResult.err(),
      });
    } else {
      const parsedConstitutionalQuestions =
        parseConstitutionalQuestionsResult.ok();
      for (const [
        i,
        question,
      ] of parsedConstitutionalQuestions.questions.entries()) {
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
    }
  }

  const definitionGrid = readGridFromElectionDefinition(avsInterface);

  const election: Election = {
    type: electionParty ? 'primary' : 'general',
    title,
    date: parsedDate.toISO(),
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
        partyId: electionParty?.id,
      },
    ],
    contests,
    ballotLayout: {
      paperSize,
      metadataEncoding: 'qr-code',
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
        gridPositions: definitionGrid.map(({ candidate, column, row }) => {
          const metadata = optionMetadataByCandidate.get(candidate);
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
    result: parseElectionResult.ok(),
    issues,
  });
}
