import * as builders from './builders';

export { asElectionDefinition } from './util';
export * as electionGridLayoutNewHampshireTestBallotFixtures from './data/election_grid_layout_new_hampshire_test_ballot';
export * as electionGridLayoutNewHampshireHudsonFixtures from './data/election_grid_layout_new_hampshire_hudson';
export * as electionFamousNames2021Fixtures from './data/election_famous_names_2021';
export * as electionMultiPartyPrimaryFixtures from './data/election_multi_party_primary';
export * as electionTwoPartyPrimaryFixtures from './data/election_two_party_primary';
export * as electionPrimaryPrecinctSplitsFixtures from './data/election_primary_precinct_splits';
export * as electionWithMsEitherNeitherFixtures from './data/election_with_ms_either_neither';
export * as sampleBallotImages from './data/sample_ballot_images';
export {
  readElectionDefinition as readElectionGeneralDefinition,
  readElection as readElectionGeneral,
} from './data/election_general';
export * as electionGeneralFixtures from './data/election_general';
export {
  readElectionDefinition as readMultiPartyPrimaryElectionDefinition,
  readElection as readMultiPartyPrimaryElection,
} from './data/election_multi_party_primary';
export {
  readElectionDefinition as readElectionTwoPartyPrimaryDefinition,
  readElection as readElectionTwoPartyPrimary,
} from './data/election_two_party_primary';
export {
  readElectionDefinition as readElectionWithMsEitherNeitherDefinition,
  readElection as readElectionWithMsEitherNeither,
} from './data/election_with_ms_either_neither';
export const systemSettings = builders.file('data/systemSettings.json');
export * from './tmpdir';
