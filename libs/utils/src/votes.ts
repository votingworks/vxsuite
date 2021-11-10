import {
  Candidate,
  CandidateContest,
  CandidateVote,
  CastVoteRecord,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  getDistrictIdsForPartyId,
  getEitherNeitherContests,
  Tally,
  VotesDict,
  VotingMethod,
  YesNoContest,
  YesNoVote,
  YesNoVoteId,
  YesOrNo,
  TallyCategory,
  FullElectionTally,
  BatchTally,
  Party,
  writeInCandidate,
  PartyId,
  PrecinctId,
  CandidateId,
  ContestTallyMeta,
} from '@votingworks/types';
import { strict as assert } from 'assert';
import { find } from './find';
import { throwIllegalValue, typedAs } from '.';

const MISSING_BATCH_ID = 'missing-batch-id';

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0];
  }
  return undefined;
}

export function normalizeWriteInId(candidateId: CandidateId): string {
  if (
    candidateId.startsWith('__writein') ||
    candidateId.startsWith('__write-in') ||
    candidateId.startsWith('writein') ||
    candidateId.startsWith('write-in')
  ) {
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
  assert.equal(contest.type, 'yesno');
  return ['yes', 'no'];
}

/**
 * Gets all the vote options a voter can make for a given contest. If write-ins are allowed a single write-in candidate ID is included.
 * @returns ContestVoteOption[] ex. ['yes', 'no'] or ['aaron', 'bob', '__write-in']
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
  filterContestsByParty?: string;
}
export function tallyVotesByContest({
  election,
  votes,
  filterContestsByParty,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {};
  const { contests } = election;

  const districtsForParty = filterContestsByParty
    ? getDistrictIdsForPartyId(election, filterContestsByParty)
    : [];

  for (const contest of expandEitherNeitherContests(contests)) {
    if (
      filterContestsByParty === undefined ||
      (districtsForParty.includes(contest.districtId) &&
        contest.partyId === filterContestsByParty)
    ) {
      const tallies: Dictionary<ContestOptionTally> = {};
      if (contest.type === 'yesno') {
        tallies.yes = { option: ['yes'], tally: 0 };
        tallies.no = { option: ['no'], tally: 0 };
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
  }

  return contestTallies;
}

export function calculateTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: ReadonlySet<CastVoteRecord>,
  filterContestsByParty?: string
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
    filterContestsByParty,
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
): string | undefined {
  return election.ballotStyles.find((bs) => bs.id === CVR._ballotStyleId)
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
      tallyResults[key] = calculateTallyForCastVoteRecords(
        election,
        cvrs,
        tallyCategory === TallyCategory.Party ? key : undefined
      );
    }
    resultsByCategory.set(tallyCategory, tallyResults);
  }

  return {
    overallTally,
    resultsByCategory,
  };
}

export function filterContestTalliesByPartyId(
  election: Election,
  contestTallies: Dictionary<ContestTally>,
  partyId: PartyId
): Dictionary<ContestTally> {
  const districts = election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
  const contestIds = expandEitherNeitherContests(
    election.contests.filter(
      (contest) =>
        districts.includes(contest.districtId) && contest.partyId === partyId
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

interface FilterTalliesByPartyParams {
  election: Election;
  electionTally: Tally;
  party?: Party;
  ballotCountsByParty?: Dictionary<Dictionary<number>>;
}

export function filterTalliesByParty({
  election,
  electionTally,
  party,
  ballotCountsByParty,
}: FilterTalliesByPartyParams): Tally {
  if (!party) {
    return electionTally;
  }

  const ballotCounts =
    ballotCountsByParty?.[party.id] ?? electionTally.ballotCountsByVotingMethod;

  return {
    ...electionTally,
    contestTallies: filterContestTalliesByPartyId(
      election,
      electionTally.contestTallies,
      party.id
    ),
    ballotCountsByVotingMethod: ballotCounts,
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

export function filterTalliesByParams(
  fullElectionTally: FullElectionTally,
  election: Election,
  {
    precinctId,
    scannerId,
    partyId,
    votingMethod,
    batchId,
  }: {
    precinctId?: PrecinctId;
    scannerId?: string;
    partyId?: PartyId;
    votingMethod?: VotingMethod;
    batchId?: string;
  }
): Tally {
  const { overallTally, resultsByCategory } = fullElectionTally;

  if (!scannerId && !precinctId && !partyId && !votingMethod && !batchId) {
    return overallTally;
  }

  if (scannerId && !precinctId && !partyId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    );
  }

  if (batchId && !precinctId && !partyId && !votingMethod && !scannerId) {
    return (
      resultsByCategory.get(TallyCategory.Batch)?.[batchId] || getEmptyTally()
    );
  }

  if (precinctId && !scannerId && !partyId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    );
  }
  if (partyId && !scannerId && !precinctId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    );
  }

  if (votingMethod && !partyId && !scannerId && !precinctId && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.VotingMethod)?.[votingMethod] ||
      getEmptyTally()
    );
  }
  const cvrFiles: Set<CastVoteRecord> = new Set();
  const allVotes: VotesDict[] = [];

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
              const vote = buildVoteFromCvr({ election, cvr: CVR });
              const votingMethodForCvr = getVotingMethodForCastVoteRecord(CVR);
              /* istanbul ignore next */
              const count = ballotCountsByVotingMethod[votingMethodForCvr] ?? 0;
              ballotCountsByVotingMethod[votingMethodForCvr] = count + 1;
              cvrFiles.add(CVR);
              allVotes.push(vote);
            }
          }
        }
      }
    }
  }

  const contestTallies = tallyVotesByContest({
    election,
    votes: allVotes,
    filterContestsByParty: partyId,
  });
  return {
    contestTallies,
    castVoteRecords: cvrFiles,
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
  };
}
