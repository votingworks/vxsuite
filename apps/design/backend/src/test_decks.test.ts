import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotLayout,
  DEFAULT_LAYOUT_OPTIONS,
  layOutAllBallotStyles,
} from '@votingworks/hmpb-layout';
import {
  BallotType,
  ElectionDefinition,
  getContests,
} from '@votingworks/types';
import { assert, iter } from '@votingworks/basics';
import {
  getBallotStyleById,
  getBallotStylesByPrecinctId,
  numBallotPositions,
} from '@votingworks/utils';
import { createPrecinctTestDeck } from './test_decks';

function expectedTestDeckPages(
  ballots: BallotLayout[],
  electionDefinition: ElectionDefinition
): number {
  return iter(ballots)
    .map((ballot) => {
      const { document, gridLayout } = ballot;
      const ballotStyle = getBallotStyleById(
        electionDefinition,
        gridLayout.ballotStyleId
      );
      const contests = getContests({
        election: electionDefinition.election,
        ballotStyle,
      });
      const maxContestOptions = Math.max(...contests.map(numBallotPositions));
      const blankBallots = 2;
      const overvotedBallots = 1;
      return (
        document.pages.length *
        (maxContestOptions + blankBallots + overvotedBallots)
      );
    })
    .sum();
}

// We test mainly that the test decks have the right number of pages, relying on
// the fact that generateTestDeckBallots is tested in
// libs/utils/src/test_deck_ballots.test.ts (ensuring we generate the ballots
// with the proper votes) and that markBallot is tested by the ballot fixtures
// in libs/hmpb/render-backend (ensuring the marks and write-ins look good) and
// corresponding interpretation tests in libs/ballot-interpreter (ensuring the
// marks and write-ins are interpreted correctly).
//
// Once ballot rendering is faster, it might be nice to also have a snapshot
// test for test deck PDFs to ensure it all comes together correctly.
describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', () => {
    const electionDefinition = electionGeneralDefinition;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length === 1
    );
    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();
    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId,
      ballots,
    });
    assert(testDeckDocument);

    const precinctBallots = ballots.filter(
      (ballot) => ballot.precinctId === precinctId
    );
    assert(precinctBallots.length === 1);
    expect(testDeckDocument.pages.length).toEqual(
      expectedTestDeckPages(precinctBallots, electionDefinition)
    );
  });

  test('for a precinct with multiple ballot styles', () => {
    const electionDefinition = electionTwoPartyPrimaryDefinition;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length > 1
    );

    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();
    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId,
      ballots,
    });
    assert(testDeckDocument);

    const precinctBallots = ballots.filter(
      (ballot) => ballot.precinctId === precinctId
    );
    assert(precinctBallots.length > 1);
    expect(testDeckDocument.pages.length).toEqual(
      expectedTestDeckPages(precinctBallots, electionDefinition)
    );
  });

  test('for a precinct with no ballot styles', () => {
    const electionDefinition = electionGeneralDefinition;
    const { election } = electionDefinition;
    const precinctWithNoBallotStyles = election.precincts.find(
      (precinct) =>
        getBallotStylesByPrecinctId(electionDefinition, precinct.id).length ===
        0
    );
    assert(precinctWithNoBallotStyles);

    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId: precinctWithNoBallotStyles.id,
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});
