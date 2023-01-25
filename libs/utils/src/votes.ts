import {
  BatchTally,
  Candidate,
  CandidateContest,
  CandidateId,
  CandidateVote,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  ContestOptionTally,
  ContestTally,
  ContestTallyMeta,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  FullElectionTally,
  getBallotStyle,
  getEitherNeitherContests,
  Optional,
  PartyId,
  PrecinctId,
  Tally,
  TallyCategory,
  VotesDict,
  VotingMethod,
  writeInCandidate,
  YesNoContest,
  YesNoVote,
  YesNoVoteId,
  YesOrNo,
} from '@votingworks/types';
import { assert, throwIllegalValue } from './assert';
import { find } from './find';
import { typedAs } from './types';

const MISSING_BATCH_ID = 'missing-batch-id';

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0];
  }
  return undefined;
}

export function normalizeWriteInId(candidateId: CandidateId): string {
  if (candidateId.startsWith('write-in')) {
    return writeInCandidate.id;
  }

  return candidateId;
}

export function buildVoteFromCvr({
  election,
  cvr,
}: {
  election: Election;
  cvr: CastVoteRecord;
}): VotesDict {
  const vote: VotesDict = {};
  const mutableCvr: CastVoteRecord = { ...cvr };

  // If the CVR is malformed for this question -- only one of the pair'ed contest IDs
  // is there -- we don't want to count this as a ballot in this contest.
  for (const c of getEitherNeitherContests(election.contests)) {
    const hasEitherNeither = mutableCvr[c.eitherNeitherContestId] !== undefined;
    const hasPickOne = mutableCvr[c.pickOneContestId] !== undefined;

    if (!(hasEitherNeither && hasPickOne)) {
      mutableCvr[c.eitherNeitherContestId] = undefined;
      mutableCvr[c.pickOneContestId] = undefined;
    }
  }

  for (const contest of expandEitherNeitherContests(election.contests)) {
    if (!mutableCvr[contest.id]) {
      continue;
    }

    if (contest.type === 'yesno') {
      // the CVR is encoded the same way
      vote[contest.id] = mutableCvr[contest.id] as unknown as YesNoVote;
      continue;
    }

    /* istanbul ignore else */
    if (contest.type === 'candidate') {
      vote[contest.id] = (mutableCvr[contest.id] as string[])
        .map((candidateId) => normalizeWriteInId(candidateId))
        .map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        );
    }
  }

  return vote;
}

/**
 * Gets all the vote options a voter can make for a given yes/no contest.
 */
export function getContestVoteOptionsForYesNoContest(
  contest: YesNoContest
): readonly YesNoVoteId[] {
  assert(contest.type === 'yesno');
  return ['yes', 'no'];
}

/**
 * Gets all the vote options a voter can make for a given contest. If write-ins are allowed a single write-in candidate ID is included.
 * @returns ContestVoteOption[] ex. ['yes', 'no'] or ['aaron', 'bob', 'write-in']
 */
export function getContestVoteOptionsForCandidateContest(
  contest: CandidateContest
): readonly Candidate[] {
  const options = contest.candidates;
  if (contest.allowWriteIns) {
    return options.concat(writeInCandidate);
  }
  return options;
}

export function getVotingMethodForCastVoteRecord(
  CVR: CastVoteRecord
): VotingMethod {
  return Object.values(VotingMethod).includes(CVR._ballotType as VotingMethod)
    ? (CVR._ballotType as VotingMethod)
    : VotingMethod.Unknown;
}

interface TallyParams {
  election: Election;
  votes: VotesDict[];
}
export function tallyVotesByContest({
  election,
  votes,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {};

  for (const contest of expandEitherNeitherContests(election.contests)) {
    const tallies: Dictionary<ContestOptionTally> = {};
    if (contest.type === 'yesno') {
      tallies['yes'] = { option: ['yes'], tally: 0 };
      tallies['no'] = { option: ['no'], tally: 0 };
    }

    if (contest.type === 'candidate') {
      for (const candidate of contest.candidates) {
        tallies[candidate.id] = { option: candidate, tally: 0 };
      }
      if (contest.allowWriteIns) {
        tallies[writeInCandidate.id] = { option: writeInCandidate, tally: 0 };
      }
    }

    let numberOfUndervotes = 0;
    let numberOfOvervotes = 0;
    let numberOfVotes = 0;
    for (const vote of votes) {
      const selected = vote[contest.id];
      if (!selected) {
        continue;
      }

      numberOfVotes += 1;
      // overvotes & undervotes
      const maxSelectable = contest.type === 'yesno' ? 1 : contest.seats;
      if (selected.length > maxSelectable) {
        numberOfOvervotes += maxSelectable;
        continue;
      }
      if (selected.length < maxSelectable) {
        numberOfUndervotes += maxSelectable - selected.length;
      }
      if (selected.length === 0) {
        continue;
      }

      if (contest.type === 'yesno') {
        const optionId = selected[0] as string;
        const optionTally = tallies[optionId];
        assert(optionTally);
        tallies[optionId] = {
          option: optionTally.option,
          tally: optionTally.tally + 1,
        };
      } else {
        for (const selectedOption of selected as CandidateVote) {
          const optionTally = tallies[selectedOption.id];
          assert(optionTally);
          tallies[selectedOption.id] = {
            option: optionTally.option,
            tally: optionTally.tally + 1,
          };
        }
      }
    }
    const metadataForContest: ContestTallyMeta = {
      undervotes: numberOfUndervotes,
      overvotes: numberOfOvervotes,
      ballots: numberOfVotes,
    };

    contestTallies[contest.id] = {
      contest,
      tallies,
      metadata: metadataForContest,
    };
  }

  return contestTallies;
}

export function calculateTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: ReadonlySet<CastVoteRecord>
): Tally {
  const allVotes: VotesDict[] = [];
  const ballotCountsByVotingMethod: Dictionary<number> = {};
  for (const votingMethod of Object.values(VotingMethod)) {
    ballotCountsByVotingMethod[votingMethod] = 0;
  }
  for (const CVR of castVoteRecords) {
    const vote = buildVoteFromCvr({ election, cvr: CVR });
    const votingMethod = getVotingMethodForCastVoteRecord(CVR);
    const count = ballotCountsByVotingMethod[votingMethod];
    assert(typeof count !== 'undefined');
    ballotCountsByVotingMethod[votingMethod] = count + 1;
    allVotes.push(vote);
  }

  const overallTally = tallyVotesByContest({
    election,
    votes: allVotes,
  });

  return {
    contestTallies: overallTally,
    castVoteRecords: new Set(castVoteRecords),
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
  };
}

interface BatchInfo {
  readonly castVoteRecords: Set<CastVoteRecord>;
  readonly batchLabels: Set<string>;
  readonly scannerIds: Set<string>;
}

export function getPartyIdForCvr(
  CVR: CastVoteRecord,
  election: Election
): PartyId | undefined {
  return getBallotStyle({ election, ballotStyleId: CVR._ballotStyleId })
    ?.partyId;
}

export function computeTallyWithPrecomputedCategories(
  election: Election,
  castVoteRecords: ReadonlySet<CastVoteRecord>,
  tallyCategories: TallyCategory[]
): FullElectionTally {
  const overallTally = calculateTallyForCastVoteRecords(
    election,
    castVoteRecords
  );
  const resultsByCategory = new Map<TallyCategory, Dictionary<Tally>>();

  for (const tallyCategory of tallyCategories) {
    // Batch category is more complex and needs to be handled separately
    if (tallyCategory === TallyCategory.Batch) {
      const cvrFilesByBatch: Dictionary<BatchInfo> = {};
      for (const CVR of castVoteRecords) {
        const batchId = CVR._batchId || MISSING_BATCH_ID;
        const batchInfo = cvrFilesByBatch[batchId];
        const filesForBatch =
          batchInfo?.castVoteRecords ?? new Set<CastVoteRecord>();
        const batchLabels = batchInfo?.batchLabels ?? new Set<string>();
        const batchScannerIds = batchInfo?.scannerIds ?? new Set<string>();
        if (!batchInfo) {
          cvrFilesByBatch[batchId] = {
            castVoteRecords: filesForBatch,
            batchLabels,
            scannerIds: batchScannerIds,
          };
        }
        filesForBatch.add(CVR);
        if (CVR._batchLabel) {
          batchLabels.add(CVR._batchLabel);
        }
        batchScannerIds.add(CVR._scannerId);
      }
      const batchTallyResults: Dictionary<Tally> = {};
      for (const batchId of Object.keys(cvrFilesByBatch)) {
        const batchInfo = cvrFilesByBatch[batchId];
        assert(batchInfo);
        const batchLabels = [...batchInfo.batchLabels];
        const batchLabel =
          batchLabels.length > 0 ? batchLabels[0] : 'Missing Batch';
        assert(typeof batchLabel === 'string');
        batchTallyResults[batchId] = typedAs<BatchTally>({
          ...calculateTallyForCastVoteRecords(
            election,
            batchInfo.castVoteRecords
          ),
          batchLabel,
          scannerIds: [...batchInfo.scannerIds],
        });
      }
      resultsByCategory.set(tallyCategory, batchTallyResults);
      continue;
    }

    const cvrFiles: Dictionary<Set<CastVoteRecord>> = {};
    // Set up cvrFiles dictionary if necessary for the TallyCategory
    switch (tallyCategory) {
      case TallyCategory.Precinct: {
        for (const precinct of election.precincts) {
          cvrFiles[precinct.id] = new Set();
        }
        break;
      }
      case TallyCategory.Party: {
        for (const bs of election.ballotStyles) {
          if (bs.partyId !== undefined && !(bs.partyId in cvrFiles)) {
            cvrFiles[bs.partyId] = new Set();
          }
        }
        break;
      }
      case TallyCategory.VotingMethod: {
        for (const votingMethod of Object.values(VotingMethod)) {
          cvrFiles[votingMethod] = new Set();
        }
        break;
      }
      case TallyCategory.Scanner:
        // do nothing no initialization needed
        break;
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(tallyCategory);
    }

    // Place all the CVRs in the dictionary properly
    for (const CVR of castVoteRecords) {
      let dictionaryKey: string | undefined;
      switch (tallyCategory) {
        case TallyCategory.Precinct:
          dictionaryKey = CVR._precinctId;
          break;
        case TallyCategory.Scanner:
          dictionaryKey = CVR._scannerId;
          break;
        case TallyCategory.Party:
          dictionaryKey = getPartyIdForCvr(CVR, election);
          break;
        case TallyCategory.VotingMethod:
          dictionaryKey = getVotingMethodForCastVoteRecord(CVR);
          break;
        /* istanbul ignore next - compile time check for completeness */
        default:
          throwIllegalValue(tallyCategory);
      }
      if (dictionaryKey !== undefined) {
        let files = cvrFiles[dictionaryKey];
        if (!files) {
          files = new Set();
          cvrFiles[dictionaryKey] = files;
        }
        files.add(CVR);
      }
    }
    const tallyResults: Dictionary<Tally> = {};
    for (const key of Object.keys(cvrFiles)) {
      const cvrs = cvrFiles[key];
      assert(cvrs);
      tallyResults[key] = calculateTallyForCastVoteRecords(election, cvrs);
    }
    resultsByCategory.set(tallyCategory, tallyResults);
  }

  return {
    overallTally,
    resultsByCategory,
  };
}

/**
 * Include only results without a party affiliation.
 */
export const NONPARTISAN_FILTER = 'nonpartisan-filter';

/**
 * Include all results for all parties and results for nonpartisan races.
 */
export const ALL_PARTY_FILTER = 'all-party-filter';

/**
 * Used where {@link PartyId} as a filter may be insufficient. For example,
 * where we want to be a) able to filter on a single party, b) filter specifically
 * on nonpartisan contests or races and c) do not filter.
 */
export type PartyFilter =
  | PartyId
  | typeof NONPARTISAN_FILTER
  | typeof ALL_PARTY_FILTER;

/**
 * Filters a {@link ContestTally} dictionary by party, including only contests
 * identified by the provided {@link PartyFilter}.
 */
function filterContestTalliesByParty(
  election: Election,
  contestTallies: Dictionary<ContestTally>,
  partyFilter: PartyFilter
): Dictionary<ContestTally> {
  if (partyFilter === ALL_PARTY_FILTER) return contestTallies;

  const contestIds = expandEitherNeitherContests(
    election.contests.filter(
      (contest) =>
        contest.partyId ===
        (partyFilter === NONPARTISAN_FILTER ? undefined : partyFilter)
    )
  ).map((contest) => contest.id);

  const filteredContestTallies: Dictionary<ContestTally> = {};
  for (const contestId of Object.keys(contestTallies)) {
    if (contestIds.includes(contestId)) {
      filteredContestTallies[contestId] = contestTallies[contestId];
    }
  }
  return filteredContestTallies;
}

/**
 * Filters which contests are included in a {@link Tally}, but does not
 * filter any of the contests or voting method metadata.
 */
export function filterTallyContestsByParty(
  election: Election,
  tally: Tally,
  partyFilter: PartyFilter
): Tally {
  return {
    ...tally,
    contestTallies: filterContestTalliesByParty(
      election,
      tally.contestTallies,
      partyFilter
    ),
  };
}

export function getEmptyTally(): Tally {
  return {
    numberOfBallotsCounted: 0,
    castVoteRecords: new Set(),
    contestTallies: {},
    ballotCountsByVotingMethod: {},
  };
}

export interface CastVoteRecordFilters {
  precinctId?: PrecinctId;
  scannerId?: string;
  partyId?: PartyId;
  votingMethod?: VotingMethod;
  batchId?: string;
}

function getCastVoteRecordFilterCount(
  castVoteRecordFilters: CastVoteRecordFilters
) {
  return (
    (castVoteRecordFilters.precinctId ? 1 : 0) +
    (castVoteRecordFilters.scannerId ? 1 : 0) +
    (castVoteRecordFilters.partyId ? 1 : 0) +
    (castVoteRecordFilters.votingMethod ? 1 : 0) +
    (castVoteRecordFilters.batchId ? 1 : 0)
  );
}

export interface ContestFilters {
  contestPartyFilter?: PartyFilter;
}

/**
 * Retrieves or, if necessary, creates a tally that only includes cast vote
 * records under the specified filters. By default, filters out contests that
 * are not associated with the provided `partyId` (or `undefined` for nonpartisan
 * contests) but contest filtering can be overridden by passing in an explicit
 * `contestPartyFilter`.
 */
export function filterTalliesByParams(
  fullElectionTally: FullElectionTally,
  election: Election,
  {
    precinctId,
    scannerId,
    partyId,
    votingMethod,
    batchId,
  }: CastVoteRecordFilters,
  { contestPartyFilter: contestPartyFilterFromParams }: ContestFilters = {}
): Tally {
  const { overallTally, resultsByCategory } = fullElectionTally;

  /*
   * Hierarchy to decide which contests to include in the returned tallies:
   * 1. Contests are filtered according to `contestPartyFilter` prop. If none,
   * 2. Only contests associated with the `partyId` cast vote record filter are included. If none,
   * 3. Only nonpartisan races are included.
   */
  const contestPartyFilter =
    contestPartyFilterFromParams ?? partyId ?? NONPARTISAN_FILTER;
  function filterContests(tally: Tally): Tally {
    return filterTallyContestsByParty(election, tally, contestPartyFilter);
  }

  const numCastVoteRecordFilters = getCastVoteRecordFilterCount({
    precinctId,
    scannerId,
    partyId,
    votingMethod,
    batchId,
  });

  // With no cast vote record filters, return the overall tally
  if (numCastVoteRecordFilters === 0) {
    return filterContests(overallTally);
  }

  // If there is a single cast vote record filter, return the precomputed category
  if (numCastVoteRecordFilters === 1) {
    let precomputedTally: Optional<Tally>;
    if (scannerId) {
      precomputedTally = resultsByCategory.get(TallyCategory.Scanner)?.[
        scannerId
      ];
    } else if (precinctId) {
      precomputedTally = resultsByCategory.get(TallyCategory.Precinct)?.[
        precinctId
      ];
    } else if (batchId) {
      precomputedTally = resultsByCategory.get(TallyCategory.Batch)?.[batchId];
    } else if (partyId) {
      precomputedTally = resultsByCategory.get(TallyCategory.Party)?.[partyId];
    } else if (votingMethod) {
      precomputedTally = resultsByCategory.get(TallyCategory.VotingMethod)?.[
        votingMethod
      ];
    }
    return filterContests(precomputedTally || getEmptyTally());
  }

  // If there are multiple filters, determine what cast vote records should be
  // included based on the precomputed tallies and compute the more specific tally
  // on the fly.
  const cvrFiles: Set<CastVoteRecord> = new Set();

  const precinctTally = precinctId
    ? resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    : undefined;
  const scannerTally = scannerId
    ? resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    : undefined;
  const partyTally = partyId
    ? resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    : undefined;
  const votingMethodTally = votingMethod
    ? resultsByCategory.get(TallyCategory.VotingMethod)?.[votingMethod] ||
      getEmptyTally()
    : undefined;
  const batchTally = batchId
    ? resultsByCategory.get(TallyCategory.Batch)?.[batchId] || getEmptyTally()
    : undefined;

  const ballotCountsByVotingMethod: Dictionary<number> = {};
  for (const method of Object.values(VotingMethod)) {
    ballotCountsByVotingMethod[method] = 0;
  }
  for (const CVR of overallTally.castVoteRecords) {
    if (!precinctTally || precinctTally.castVoteRecords.has(CVR)) {
      if (!scannerTally || scannerTally.castVoteRecords.has(CVR)) {
        if (!batchTally || batchTally.castVoteRecords.has(CVR)) {
          if (!partyTally || partyTally.castVoteRecords.has(CVR)) {
            if (
              !votingMethodTally ||
              votingMethodTally.castVoteRecords.has(CVR)
            ) {
              cvrFiles.add(CVR);
            }
          }
        }
      }
    }
  }
  return filterContests(calculateTallyForCastVoteRecords(election, cvrFiles));
}

/**
 * Enumerates the votes per contest in a CVR.
 *
 * @example
 *
 *   const cvr: CastVoteRecord = {
 *     _ballotId: 'ballot-id',
 *     _ballotStyleId: 'ballot-style-id',
 *     _ballotType: 'standard',
 *     _precinctId: 'precinct-id',
 *     _testBallot: false,
 *     _scannerId: 'scanner-id',
 *     _batchId: 'batch-id',
 *     _batchLabel: 'batch-label',
 *     _pageNumbers: [1, 2],
 *     mayor: ['seldon'],
 *     'city-council': ['hugo', 'golan'],
 *     'measure-1': ['yes'],
 *   };
 *
 *   for (const [contestId, votes] of castVoteRecordVotes(cvr)) {
 *     console.log(`${contestId}: ${votes.join(', ')}`);
 *   }
 *
 *   // Output:
 *   // mayor: seldon
 *   // city-council: hugo, golan
 *   // measure-1: yes
 */
export function* castVoteRecordVotes(
  castVoteRecord: CastVoteRecord
): Generator<[contestId: ContestId, vote: ContestOptionId[]]> {
  for (const [contestId, votes] of Object.entries(castVoteRecord)) {
    if (contestId.startsWith('_')) {
      continue;
    }

    if (Array.isArray(votes)) {
      yield [contestId, votes as ContestOptionId[]];
    }
  }
}

/**
 * Determines whether a cast vote record vote is a write-in vote.
 */
export function castVoteRecordVoteIsWriteIn(vote: ContestOptionId): boolean {
  return vote.startsWith('write-in');
}

/**
 * Determines whether a cast vote record has any write-in votes.
 */
export function castVoteRecordHasWriteIns(cvr: CastVoteRecord): boolean {
  for (const [, votes] of castVoteRecordVotes(cvr)) {
    if (votes.some((vote) => castVoteRecordVoteIsWriteIn(vote))) {
      return true;
    }
  }
  return false;
}
