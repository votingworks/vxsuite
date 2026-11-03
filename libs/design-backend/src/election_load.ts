import { DateWithoutTime, throwIllegalValue } from '@votingworks/basics';
import {
  type Election,
  type ElectionId,
  HmpbBallotPaperSize,
  isCombinedBallotPrimary,
  safeParseElectionAnyVersion,
} from '@votingworks/types';
import type { StateFeaturesConfig } from './features.js';
import type { ElectionUpload, Jurisdiction } from './types.js';
import { regenerateElectionIds, splitCandidateName } from './utils.js';

export type ConvertMsElection = (
  newId: ElectionId,
  electionFileContents: string,
  candidateFileContents: string
) => Election;

export function createBlankElection(
  id: ElectionId,
  jurisdiction: Pick<Jurisdiction, 'name' | 'stateCode'>
): Election {
  return {
    id,
    type: 'general',
    title: '',
    date: DateWithoutTime.today(),
    state: jurisdiction.stateCode,
    jurisdiction: {
      id: 'county-id',
      name: jurisdiction.name,
    },
    seal: '',
    districts: [],
    precincts: [],
    pollingPlaces: [],
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

export function prepareLoadedElection({
  upload,
  newId,
  stateFeatures,
  convertMsElection,
}: {
  upload: ElectionUpload;
  newId: ElectionId;
  stateFeatures: StateFeaturesConfig;
  convertMsElection?: ConvertMsElection;
}): { election: Election; isMiCombinedBallotPrimary: boolean } {
  switch (upload.format) {
    case 'vxf': {
      const sourceElection = safeParseElectionAnyVersion(
        upload.electionFileContents
      ).unsafeUnwrap();

      const { districts, precincts, parties, contests, pollingPlaces } =
        regenerateElectionIds(sourceElection, stateFeatures);

      const contestsWithSplitCandidateNames = contests.map((contest) => {
        if (contest.type !== 'candidate') return contest;
        return {
          ...contest,
          candidates: contest.candidates.map((candidate) => {
            // @coverage-defer
            if (
              candidate.firstName !== undefined &&
              candidate.middleName !== undefined &&
              candidate.lastName !== undefined
            ) {
              return candidate;
            }
            return {
              ...candidate,
              ...splitCandidateName(candidate.name),
            };
          }),
        };
      });

      return {
        isMiCombinedBallotPrimary: isCombinedBallotPrimary(sourceElection),
        election: {
          ...sourceElection,
          id: newId,
          jurisdiction: {
            ...sourceElection.jurisdiction,
            id: `${newId}-county`,
          },
          districts,
          pollingPlaces,
          precincts,
          parties,
          contests: contestsWithSplitCandidateNames,
          ballotStyles: [],
          // @coverage-defer
          seal: sourceElection.seal ?? '',
          signature: sourceElection.signature,
        },
      };
    }

    case 'ms-sems': {
      if (!convertMsElection) {
        throw new Error('MS SEMS import is not supported here');
      }
      return {
        election: convertMsElection(
          newId,
          upload.electionFileContents,
          upload.candidateFileContents
        ),
        isMiCombinedBallotPrimary: false,
      };
    }

    default: {
      return throwIllegalValue(upload);
    }
  }
}
