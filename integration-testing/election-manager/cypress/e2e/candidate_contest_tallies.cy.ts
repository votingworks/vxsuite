import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  generateCvr,
  generateFileContentFromCvrs,
} from '@votingworks/test-utils';
import { BallotIdSchema, unsafeParse } from '@votingworks/types';
import {
  assertExpectedResultsMatchSEMsFile,
  assertExpectedResultsMatchTallyReport,
} from '../support/assertions';
import {
  electionMultiPartyPrimaryCypressHash,
  enterPin,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '../support/auth';

describe('Election Manager can create SEMS tallies', () => {
  it('Tallies for candidate contests compute end to end as expected', () => {
    const { electionDefinition } = electionMultiPartyPrimaryFixtures;
    const { election, electionData } = electionDefinition;
    // Generate a CVR file with votes in the president contest.
    const fakeCvrFileContents = generateFileContentFromCvrs([
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator'],
          'schoolboard-liberty': [],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '1'),
        }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['peter-pigeon'],
          'schoolboard-liberty': ['amber-brkich', 'chris-daugherty'],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '2'),
        }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator', 'peter-pigeon'],
          'schoolboard-liberty': [
            'amber-brkich',
            'chris-daugherty',
            'tom-westman',
          ],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '3'),
        }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': ['aaron-aligator'],
          'schoolboard-liberty': [
            'amber-brkich',
            'chris-daugherty',
            'tom-westman',
            'danni-boatwright',
          ],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '4'),
        }
      ),
      generateCvr(
        election,
        {
          'governor-contest-liberty': [],
          'schoolboard-liberty': ['amber-brkich'],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '5'),
        }
      ),
      // duplicate cvr should be ignored
      generateCvr(
        election,
        {
          'governor-contest-liberty': [],
          'schoolboard-liberty': ['amber-brkich'],
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2L',
          ballotId: unsafeParse(BallotIdSchema, '5'),
        }
      ),
    ]);
    cy.visit('/');
    mockSystemAdministratorCardInsertion();
    enterPin();
    mockCardRemoval();
    cy.contains('Convert from SEMS files');
    cy.get('input[type="file"]').attachFile(
      'electionMultiPartyPrimarySample.json'
    );
    cy.contains('Election loading');
    cy.contains(electionMultiPartyPrimaryCypressHash.slice(0, 10));
    cy.pause();
    cy.contains('Lock Machine').click();
    mockElectionManagerCardInsertion({
      electionData,
      electionHash: electionMultiPartyPrimaryCypressHash,
    });
    enterPin();
    mockCardRemoval();
    cy.contains('Tally').click();
    cy.contains('Load CVR Files').click();
    cy.get('input[data-testid="manual-input"]').attachFile({
      fileContent: new Blob([fakeCvrFileContents]),
      fileName: 'cvrFile.jsonl',
      mimeType: 'application/json',
      encoding: 'utf-8',
    });
    cy.contains('Close').click();
    cy.get('[data-testid="total-cvr-count"]').within(() => cy.contains('5'));

    // Check that the internal tally reports have the correct tallies
    const expectedFullResults = [
      {
        contestId: 'governor-contest-liberty',
        metadata: { ballots: 5, undervotes: 1, overvotes: 1 },
        votesByOptionId: {
          'aaron-aligator': 2,
          'peter-pigeon': 1,
          'write-in': 0,
        },
      },
      {
        contestId: 'schoolboard-liberty',
        metadata: { ballots: 5, undervotes: 3, overvotes: 4 },
        votesByOptionId: {
          'amber-brkich': 2,
          'chris-daugherty': 1,
          'tom-westman': 0,
          'danni-boatwright': 0,
          'write-in': 0,
        },
      },
    ];

    const expectedEmptyResults = [
      {
        contestId: 'governor-contest-liberty',
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
        votesByOptionId: {
          'aaron-aligator': 0,
          'peter-pigeon': 0,
          'write-in': 0,
        },
      },
      {
        contestId: 'schoolboard-liberty',
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
        votesByOptionId: {
          'amber-brkich': 0,
          'chris-daugherty': 0,
          'tom-westman': 0,
          'danni-boatwright': 0,
          'write-in': 0,
        },
      },
    ];
    cy.contains('Reports').click();
    cy.contains('Unofficial Full Election Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct 2 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct 1 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct 3 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct 4 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Precinct 5 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedEmptyResults, {
      absentee: 0,
      precinct: 0,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Liberty Party Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    });
    cy.contains('Back to Reports').click();
    cy.contains('Unofficial Scanner scanner-1 Tally Report').click();
    assertExpectedResultsMatchTallyReport(expectedFullResults, {
      absentee: 0,
      precinct: 5,
    });
    cy.contains('Back to Reports').click();

    // Check that the saved SEMS result file as the correct tallies
    cy.contains('Save Results File').click();
    cy.get('[data-testid="manual-export"]').click();
    cy.contains('Results Saved');
    cy.task<string>('readMostRecentFile', 'cypress/downloads').then(
      (fileContent) => {
        assertExpectedResultsMatchSEMsFile(
          [
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: 'aaron-aligator',
              numberOfVotes: 2,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: 'peter-pigeon',
              numberOfVotes: 1,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 1,
            },
            {
              contestId: 'governor-contest-liberty',
              precinctId: 'precinct-2',
              candidateId: '1', // overvotes
              numberOfVotes: 1,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 3,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: '1', // overvotes
              numberOfVotes: 4,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: 'amber-brkich',
              numberOfVotes: 2,
            },
            {
              contestId: 'schoolboard-liberty',
              precinctId: 'precinct-2',
              candidateId: 'chris-daugherty',
              numberOfVotes: 1,
            },
            {
              contestId: 'chief-pokemon-liberty',
              precinctId: 'precinct-2',
              candidateId: '2', // undervotes
              numberOfVotes: 5,
            },
          ],
          fileContent
        );
      }
    );
  });
});
