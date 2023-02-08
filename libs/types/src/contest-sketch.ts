// ########## Election def ############

type ContestId = string;

// Candidate contests

type CandidateId = string;

interface Candidate {
  id: CandidateId;
  name: string;
}

interface CandidateOption {
  candidateId: CandidateId;
}

interface WriteInOption {
  writeInIndex: number;
}

interface CandidateContest {
  type: 'candidate';
  id: ContestId;
  name: string;
  options: Array<CandidateOption | WriteInOption>;
}

// Ballot measure contests

type BallotMeasureOptionId = 'yes' | 'no';

interface BallotMeasureOption {
  id: 'yes' | 'no';
}

interface BallotMeasureContest {
  type: 'ballot-measure';
  id: ContestId;
  name: string;
  options: BallotMeasureOption[];
}

type Contest = CandidateContest | BallotMeasureContest;

// ########### Voting system ############

// Selection represents an interpreted mark on a ballot.

interface CandidateSelection {
  candidateId: CandidateId;
}

interface WriteInSelection {
  writeInIndex: number;
  writeInText: string;
}

interface BallotMeasureSelection {
  optionId: BallotMeasureOptionId;
}

type CandidateContestSelection = CandidateSelection | WriteInSelection;
type CandidateContestSelections = CandidateContestSelection[];
type BallotMeasureContestSelections = BallotMeasureSelection[];
type ContestSelections =
  | CandidateContestSelections
  | BallotMeasureContestSelections;

type BallotSelections = Record<ContestId, ContestSelections>;

// Vote represents a selection after adjudication.

type WriteInCandidateId = string;

// Adjudication can create new write-in candidates.
interface WriteInCandidate {
  id: WriteInCandidateId;
  name: string;
}

interface CandidateVote {
  candidateId: CandidateId | WriteInCandidateId;
}

interface BallotMeasureVote {
  optionId: BallotMeasureOptionId;
}

type CandidateContestVote = CandidateVote | WriteInCandidate;
type CandidateContestVotes = CandidateContestVote[];
type BallotMeasureContestVotes = BallotMeasureVote[];
type ContestVotes = CandidateContestVotes | BallotMeasureContestVotes;

type BallotVotes = Record<ContestId, ContestVotes>;

// Tallies

type VoteCount = number;
// If we don't want to aggregate write-ins, we use write-in candidate ids
type CandidateContestTally = Record<
  CandidateId | WriteInCandidateId,
  VoteCount
>;
// If we want to aggregate write-ins, we use a special identifier 'write-ins'
type CandidateContestTallyWithAggregatedWriteIns = Record<
  CandidateId | 'write-ins',
  VoteCount
>;
type BallotMeasureContestTally = Record<BallotMeasureOptionId, VoteCount>;

// CVRs

interface CastVoteRecord {
  ballotId: string;
  selections: BallotSelections;
  votes: BallotVotes;
}

// Open questions
// - How does this interface with physical ballot stuff (e.g. marks, interpretations, etc.)?
// - What would be the source of truth for write-in candidates created during
// adjudication (since they aren't in the election definition)? Code that
// consumes votes and tallies would need to be able to look them up.
